/**
 * Utility functions for fetching and formatting Slack conversation history
 */

// Default number of conversation pairs to include as context
const DEFAULT_HISTORY_LIMIT = 5;

/**
 * Fetch recent messages from a Slack channel/DM and format as user/bot pairs
 * @param {object} client - Slack client
 * @param {string} channelId - Channel ID
 * @param {string} currentMessageTs - Timestamp of current message (to exclude it)
 * @param {number} limit - Number of conversation pairs to fetch
 * @returns {Promise<Array>} Array of {user, bot} conversation pairs
 */
async function fetchConversationHistory(client, channelId, currentMessageTs, limit = DEFAULT_HISTORY_LIMIT) {
  try {
    // Fetch more messages to account for pairing and filtering
    const result = await client.conversations.history({
      channel: channelId,
      limit: (limit * 2) + 10, // Fetch extra to account for pairing
      latest: currentMessageTs, // Get messages before the current one
      inclusive: false, // Don't include the current message
    });

    if (!result.ok || !result.messages) {
      console.log('[ConversationHistory] No messages found or API error');
      return [];
    }

    // Messages come in reverse chronological order (newest first)
    // We need to pair user messages with bot responses
    const messages = result.messages;
    const conversationPairs = [];

    // Iterate through messages to find user-bot pairs
    // A pair is: user message followed by a bot response
    for (let i = 0; i < messages.length - 1; i++) {
      const currentMsg = messages[i];
      const previousMsg = messages[i + 1]; // Previous in time (older)

      // Check if current message is a bot response and previous is a user message
      if (currentMsg.bot_id && !previousMsg.bot_id) {
        // Skip system messages
        if (previousMsg.subtype && previousMsg.subtype !== 'file_share') {
          continue;
        }

        // Skip empty messages
        if (!previousMsg.text || previousMsg.text.trim() === '') {
          continue;
        }
        if (!currentMsg.text || currentMsg.text.trim() === '') {
          continue;
        }

        conversationPairs.push({
          user: previousMsg.text,
          bot: currentMsg.text,
        });

        // Skip the user message we just paired
        i++;

        // Stop once we have enough pairs
        if (conversationPairs.length >= limit) {
          break;
        }
      }
    }

    // Reverse to get chronological order (oldest first)
    conversationPairs.reverse();

    console.log(`[ConversationHistory] Fetched ${conversationPairs.length} conversation pairs for context`);
    return conversationPairs;
  } catch (error) {
    console.error('[ConversationHistory] Error fetching history:', error.message);
    // Return empty array on error - don't fail the main request
    return [];
  }
}

/**
 * Fetch and format conversation history in one call
 * Returns array of {user, bot} pairs for the Ejento API
 * @param {object} client - Slack client
 * @param {string} channelId - Channel ID
 * @param {string} currentMessageTs - Timestamp of current message
 * @param {number} limit - Number of conversation pairs to fetch
 * @returns {Promise<Array>} Array of {user, bot} pairs for API
 */
async function getConversationContext(client, channelId, currentMessageTs, limit = DEFAULT_HISTORY_LIMIT) {
  return await fetchConversationHistory(client, channelId, currentMessageTs, limit);
}

export {
  fetchConversationHistory,
  getConversationContext,
  DEFAULT_HISTORY_LIMIT,
};
