/**
 * Streaming helper for Slack messages
 * Uses Slack's chat.startStream, chat.appendStream, and chat.stopStream APIs
 */

// Minimum interval between stream updates (ms) to avoid rate limiting
const MIN_UPDATE_INTERVAL = 100;

/**
 * Create a streaming message handler for Slack
 * @param {object} client - Slack WebClient
 * @param {string} channelId - Channel ID
 * @param {string} threadTs - Optional thread timestamp
 * @returns {object} Streaming controller
 */
export function createStreamingMessage(client, channelId, threadTs = null) {
  let streamId = null;
  let messageTs = null;
  let textBuffer = '';
  let lastUpdateTime = 0;
  let pendingUpdate = null;
  let isStarted = false;
  let isStopped = false;

  return {
    /**
     * Start the streaming message
     * @param {string} initialText - Initial text to show (optional)
     * @returns {Promise<void>}
     */
    async start(initialText = '') {
      if (isStarted) return;
      
      try {
        const result = await client.chat.startStream({
          channel: channelId,
          ...(threadTs && { thread_ts: threadTs }),
        });
        
        streamId = result.stream_id;
        messageTs = result.message?.ts;
        isStarted = true;
        textBuffer = initialText;
        
        console.log(`[Streaming] Started stream: ${streamId}`);
        
        if (initialText) {
          await this.append(initialText);
        }
      } catch (error) {
        console.error('[Streaming] Failed to start stream:', error.message);
        throw error;
      }
    },

    /**
     * Append text to the streaming message
     * @param {string} text - Text to append
     * @returns {Promise<void>}
     */
    async append(text) {
      if (!isStarted || isStopped || !streamId) return;
      
      textBuffer += text;
      
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTime;
      
      // Throttle updates to avoid rate limiting
      if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL) {
        // Schedule a pending update
        if (!pendingUpdate) {
          pendingUpdate = setTimeout(async () => {
            pendingUpdate = null;
            if (!isStopped) {
              await this._sendUpdate();
            }
          }, MIN_UPDATE_INTERVAL - timeSinceLastUpdate);
        }
        return;
      }
      
      await this._sendUpdate();
    },

    /**
     * Internal method to send update to Slack
     */
    async _sendUpdate() {
      if (!streamId || isStopped) return;
      
      try {
        await client.chat.appendStream({
          stream_id: streamId,
          channel: channelId,
          text: textBuffer,
        });
        lastUpdateTime = Date.now();
      } catch (error) {
        console.error('[Streaming] Failed to append to stream:', error.message);
      }
    },

    /**
     * Stop the streaming message with final content
     * @param {object} options - Final message options
     * @param {string} options.text - Final text
     * @param {Array} options.blocks - Optional blocks for rich formatting
     * @returns {Promise<void>}
     */
    async stop({ text, blocks } = {}) {
      if (!isStarted || isStopped) return;
      
      // Clear any pending updates
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
      
      isStopped = true;
      
      try {
        const stopOptions = {
          stream_id: streamId,
          channel: channelId,
        };
        
        if (text) {
          stopOptions.text = text;
        }
        
        if (blocks) {
          stopOptions.blocks = blocks;
        }
        
        await client.chat.stopStream(stopOptions);
        console.log(`[Streaming] Stopped stream: ${streamId}`);
      } catch (error) {
        console.error('[Streaming] Failed to stop stream:', error.message);
        throw error;
      }
    },

    /**
     * Get the current text buffer
     * @returns {string}
     */
    getText() {
      return textBuffer;
    },

    /**
     * Get the message timestamp
     * @returns {string}
     */
    getMessageTs() {
      return messageTs;
    },

    /**
     * Check if streaming is active
     * @returns {boolean}
     */
    isActive() {
      return isStarted && !isStopped;
    },
  };
}

/**
 * Fallback streaming using message updates (for when streaming API is not available)
 * @param {object} client - Slack WebClient
 * @param {string} channelId - Channel ID
 * @param {string} messageTs - Message timestamp to update
 * @returns {object} Streaming controller
 */
export function createFallbackStreaming(client, channelId, messageTs) {
  let textBuffer = '';
  let lastUpdateTime = 0;
  let pendingUpdate = null;
  let isStopped = false;
  const UPDATE_INTERVAL = 500; // Update every 500ms for fallback

  return {
    async start() {
      // No-op for fallback, message already exists
    },

    async append(text) {
      if (isStopped) return;
      
      textBuffer += text;
      
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTime;
      
      if (timeSinceLastUpdate < UPDATE_INTERVAL) {
        if (!pendingUpdate) {
          pendingUpdate = setTimeout(async () => {
            pendingUpdate = null;
            if (!isStopped) {
              await this._sendUpdate();
            }
          }, UPDATE_INTERVAL - timeSinceLastUpdate);
        }
        return;
      }
      
      await this._sendUpdate();
    },

    async _sendUpdate() {
      if (isStopped) return;
      
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: textBuffer + ' ▌', // Add cursor indicator
        });
        lastUpdateTime = Date.now();
      } catch (error) {
        console.error('[FallbackStreaming] Failed to update message:', error.message);
      }
    },

    async stop({ text, blocks } = {}) {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
      
      isStopped = true;
      
      try {
        const updateOptions = {
          channel: channelId,
          ts: messageTs,
          text: text || textBuffer,
        };
        
        if (blocks) {
          updateOptions.blocks = blocks;
        }
        
        await client.chat.update(updateOptions);
      } catch (error) {
        console.error('[FallbackStreaming] Failed to stop:', error.message);
        throw error;
      }
    },

    getText() {
      return textBuffer;
    },

    getMessageTs() {
      return messageTs;
    },

    isActive() {
      return !isStopped;
    },
  };
}

/**
 * Check if Slack streaming API is available
 * @param {object} client - Slack WebClient
 * @returns {boolean}
 */
export function isStreamingAvailable(client) {
  return typeof client.chat?.startStream === 'function';
}

