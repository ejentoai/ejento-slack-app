import { config } from '../config/index.js';
import {
  createAccessToken,
  createAgentChatThread,
  getAgentChatThreads,
  chatApiNonStream,
} from '../services/ejentoApi.js';
import { getUserAccessToken } from '../utils/tokenCache.js';
import {
  formatResponseBlocks,
  formatErrorBlocks,
  formatThinkingBlocks,
  extractUserInfo,
} from '../utils/slackHelpers.js';

const { defaultAgentId } = config.agent;

/**
 * Handle incoming messages from Slack
 * @param {object} params - Message event parameters from Slack Bolt
 */
async function handleMessage({ message, say, client }) {
  try {
    // Ignore bot messages and message edits
    if (message.bot_id || message.subtype === 'message_changed') {
      return;
    }

    const userQuery = message.text;
    const userId = message.user;
    const channelId = message.channel;

    // Skip empty messages
    if (!userQuery || userQuery.trim() === '') {
      return;
    }

    console.log(`[MessageHandler] Received message from user ${userId}: "${userQuery.substring(0, 50)}..."`);

    // Send thinking message
    const thinkingMessage = await say({
      blocks: formatThinkingBlocks(),
      text: 'Thinking...',
    });

    try {
      // Get user info from Slack
      const userInfoResponse = await client.users.info({ user: userId });
      const userInfo = extractUserInfo(userInfoResponse.user);

      console.log(`[MessageHandler] User info: ${userInfo.email}, ${userInfo.fullName}`);

      // Get or create access token
      const accessToken = await getUserAccessToken(userId, createAccessToken, {
        email: userInfo.email,
        fullName: userInfo.fullName,
      });

      console.log('accessToken', accessToken);

      // Get or create chat thread for the agent
      const agentId = defaultAgentId;
      let threadId;

      try {
        const chatThreads = await getAgentChatThreads(agentId, accessToken);
        
        if (chatThreads?.data?.chat_threads?.length > 0) {
          threadId = chatThreads.data.chat_threads[0].id;
          console.log(`[MessageHandler] Using existing thread: ${threadId}`);
        } else {
          const newThread = await createAgentChatThread(agentId, accessToken);
          threadId = newThread.data.id;
          console.log(`[MessageHandler] Created new thread: ${threadId}`);
        }
      } catch (threadError) {
        console.error('[MessageHandler] Error with chat thread, proceeding without:', threadError.message);
        threadId = null;
      }

      // Call the Ejento API
      const response = await chatApiNonStream(
        userInfo.email,
        agentId,
        userQuery,
        threadId,
        accessToken
      );

      console.log(`[MessageHandler] Got response from API`);

      // Format and send the response
      const responseBlocks = formatResponseBlocks(
        response.answer || 'I apologize, but I could not generate a response.',
        response.references || []
      );

      // Update the thinking message with the actual response
      await client.chat.update({
        channel: channelId,
        ts: thinkingMessage.ts,
        blocks: responseBlocks,
        text: response.answer || 'Response from Ejento',
      });

      // Add follow-up questions if available
      if (response.followup_questions && response.followup_questions.length > 0) {
        const followUpText = response.followup_questions
          .slice(0, 3)
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n');

        await say({
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `💡 *You might also want to ask:*\n${followUpText}`,
                },
              ],
            },
          ],
          text: 'Follow-up suggestions',
        });
      }
    } catch (apiError) {
      console.error('[MessageHandler] API Error:', apiError.message);

      // Update thinking message with error
      await client.chat.update({
        channel: channelId,
        ts: thinkingMessage.ts,
        blocks: formatErrorBlocks(
          'Sorry, I encountered an error while processing your request. Please try again.'
        ),
        text: 'Error processing request',
      });
    }
  } catch (error) {
    console.error('[MessageHandler] Unexpected error:', error);
    
    await say({
      blocks: formatErrorBlocks('An unexpected error occurred. Please try again later.'),
      text: 'Error',
    });
  }
}

/**
 * Handle app_mention events (when bot is @mentioned)
 * @param {object} params - Event parameters from Slack Bolt
 */
async function handleAppMention({ event, say, client }) {
  // Remove the bot mention from the message text
  const botMentionRegex = /<@[A-Z0-9]+>/g;
  const cleanedText = event.text.replace(botMentionRegex, '').trim();

  // Create a message-like object for the handler
  const message = {
    text: cleanedText,
    user: event.user,
    channel: event.channel,
    ts: event.ts,
  };

  // Reuse the message handler
  await handleMessage({ message, say, client });
}

export { handleMessage, handleAppMention };

