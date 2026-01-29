import { config } from '../config/index.js';
import {
  createAccessToken,
  createAgentChatThread,
  getAgentChatThreads,
  chatApiNonStream,
  chatApiWithAttachment,
  chatApiStream,
} from '../services/ejentoApi.js';
import { getUserAccessToken } from '../utils/tokenCache.js';
import {
  formatResponseBlocks,
  formatErrorBlocks,
  formatThinkingBlocks,
  extractUserInfo,
} from '../utils/slackHelpers.js';
import { 
  handleFileAttachment, 
  hasFileAttachments, 
  getSupportedFiles,
} from './attachmentHandler.js';
import { getConversationContext } from '../utils/conversationHistory.js';

const { defaultAgentId } = config.agent;

// Enable/disable streaming (can be toggled via env var)
const STREAMING_ENABLED = process.env.ENABLE_STREAMING !== 'false';

/**
 * Handle incoming messages from Slack
 * @param {object} params - Message event parameters from Slack Bolt
 */
async function handleMessage({ message, say, client }) {
  try {
    // Ignore bot messages and message edits (but allow file_share)
    if (message.bot_id) {
      return;
    }
    if (message.subtype && message.subtype !== 'file_share') {
      return;
    }

    const userQuery = message.text || '';
    const userId = message.user;
    const channelId = message.channel;

    // Check for file attachments (files array exists for file_share messages)
    const hasFiles = hasFileAttachments(message);
    
    // Debug logging for file attachments
    console.log(`[MessageHandler] Message subtype: ${message.subtype || 'none'}`);
    console.log(`[MessageHandler] Files in message:`, message.files ? message.files.length : 0);
    const supportedFiles = getSupportedFiles(message);
    let fileWasJustIndexed = false;

    console.log(`[MessageHandler] Received message from user ${userId}: "${userQuery.substring(0, 50)}..."`);
    console.log(`[MessageHandler] Has files: ${hasFiles}, Supported files: ${supportedFiles.length}`);

    // Handle file attachments first
    if (hasFiles && supportedFiles.length > 0) {
      console.log(`[MessageHandler] Processing ${supportedFiles.length} file attachment(s)`);
      
      // Process each supported file
      for (const file of supportedFiles) {
        const result = await handleFileAttachment({
          message,
          client,
          say,
          file,
          userQuery: userQuery.trim(),
        });

        if (result.indexingCompleted) {
          fileWasJustIndexed = true;
          console.log(`[MessageHandler] File ${file.name} indexed successfully`);
        }
      }

      // If there's no text query, just return after indexing
      if (!userQuery || userQuery.trim() === '') {
        console.log('[MessageHandler] No text query with file, done after indexing');
        return;
      }
    }

    // Skip empty messages (only if no files were processed)
    if (!userQuery || userQuery.trim() === '') {
      return;
    }

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

      // Fetch conversation history for context (last 5 messages)
      let conversationHistory = [];
      try {
        conversationHistory = await getConversationContext(client, channelId, message.ts, 5);
        console.log(`[MessageHandler] Fetched ${conversationHistory.length} messages for context`);
      } catch (historyError) {
        console.error('[MessageHandler] Error fetching conversation history:', historyError.message);
        // Continue without history - don't fail the main request
      }

      // Check if streaming is enabled
      const canStream = STREAMING_ENABLED;
      console.log(`[MessageHandler] Streaming enabled: ${STREAMING_ENABLED}`);

      let response;
      
      if (canStream) {
        // Use streaming response
        console.log('[MessageHandler] Using streaming response');
        response = await handleStreamingResponse({
          client,
          channelId,
          thinkingMessageTs: thinkingMessage.ts,
          userEmail: userInfo.email,
          agentId,
          userQuery,
          threadId,
          accessToken,
          isFileAttached: fileWasJustIndexed,
          history: conversationHistory,
        });
      } else {
        // Fall back to non-streaming response
        console.log('[MessageHandler] Using non-streaming response');
        if (fileWasJustIndexed) {
          console.log('[MessageHandler] Calling API with is_file_attached=true');
          response = await chatApiWithAttachment(
            userInfo.email,
            agentId,
            userQuery,
            threadId,
            accessToken,
            true, // is_file_attached
            conversationHistory
          );
        } else {
          response = await chatApiNonStream(
            userInfo.email,
            agentId,
            userQuery,
            threadId,
            accessToken,
            conversationHistory
          );
        }

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
      }

      // Add follow-up questions if available
      if (response?.followup_questions && response.followup_questions.length > 0) {
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
 * Format a status message with emoji for display
 * @param {string} status - Status message from API
 * @returns {string} Formatted status with emoji
 */
function formatStatusMessage(status) {
  const statusLower = status.toLowerCase();
  
  // Map common status messages to emojis
  if (statusLower.includes('thinking') || statusLower.includes('processing')) {
    return `🤔 ${status}`;
  } else if (statusLower.includes('search') || statusLower.includes('finding')) {
    return `🔍 ${status}`;
  } else if (statusLower.includes('document') || statusLower.includes('reading') || statusLower.includes('accessing')) {
    return `📄 ${status}`;
  } else if (statusLower.includes('analyz')) {
    return `🔬 ${status}`;
  } else if (statusLower.includes('generat') || statusLower.includes('writing')) {
    return `✍️ ${status}`;
  } else if (statusLower.includes('complet') || statusLower.includes('done')) {
    return `✅ ${status}`;
  }
  
  return `⏳ ${status}`;
}

/**
 * Handle streaming response from Ejento API
 * Shows live status updates and streams the response text as it arrives.
 * @param {object} params - Parameters for streaming
 * @returns {Promise<object>} Final response object
 */
async function handleStreamingResponse({
  client,
  channelId,
  thinkingMessageTs,
  userEmail,
  agentId,
  userQuery,
  threadId,
  accessToken,
  isFileAttached,
  history = [],
}) {
  let textBuffer = '';
  let currentStatus = '';
  let hasStartedAnswering = false;
  let finalResponse = null;
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL = 250; // Update message every 250ms
  
  try {
    // Call the streaming API
    finalResponse = await chatApiStream(
      userEmail,
      agentId,
      userQuery,
      threadId,
      accessToken,
      async (data) => {
        const now = Date.now();
        const shouldUpdate = now - lastUpdateTime >= UPDATE_INTERVAL;
        
        // Handle status messages (shown before answer starts streaming)
        if (data?.message && data.message.trim() !== '' && !hasStartedAnswering) {
          currentStatus = data.message;
          console.log('[Streaming] Status:', currentStatus);
          
          if (shouldUpdate) {
            lastUpdateTime = now;
            try {
              await client.chat.update({
                channel: channelId,
                ts: thinkingMessageTs,
                text: formatStatusMessage(currentStatus),
              });
            } catch (updateError) {
              console.log('[Streaming] Status update skipped:', updateError.message);
            }
          }
          return;
        }
        
        // Handle answer text chunks
        if (data?.delta) {
          hasStartedAnswering = true;
          textBuffer += data.delta;
        } else if (data?.text && !data?.message) {
          hasStartedAnswering = true;
          textBuffer += data.text;
        } else if (data?.answer) {
          hasStartedAnswering = true;
          textBuffer = data.answer;
        }
        
        // Update message with streaming text
        if (hasStartedAnswering && shouldUpdate && textBuffer.length > 0) {
          lastUpdateTime = now;
          try {
            await client.chat.update({
              channel: channelId,
              ts: thinkingMessageTs,
              text: textBuffer + ' ▌', // Add cursor indicator
            });
          } catch (updateError) {
            console.log('[Streaming] Text update skipped:', updateError.message);
          }
        }
      },
      isFileAttached,
      history
    );

    // Final update with formatted response
    const answer = finalResponse?.answer || textBuffer || 'I apologize, but I could not generate a response.';
    const references = finalResponse?.references || [];
    
    const responseBlocks = formatResponseBlocks(answer, references);
    
    await client.chat.update({
      channel: channelId,
      ts: thinkingMessageTs,
      blocks: responseBlocks,
      text: answer,
    });

    return {
      answer,
      references,
      followup_questions: finalResponse?.followup_questions || [],
    };
  } catch (error) {
    console.error('[MessageHandler] Streaming error:', error.message);
    
    // Try to update the message with error
    try {
      await client.chat.update({
        channel: channelId,
        ts: thinkingMessageTs,
        blocks: formatErrorBlocks('Sorry, an error occurred while processing your request.'),
        text: 'Error processing request',
      });
    } catch (updateError) {
      console.error('[MessageHandler] Failed to update error message:', updateError.message);
    }
    
    throw error;
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

