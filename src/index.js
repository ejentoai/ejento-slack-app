import { App } from '@slack/bolt';
import { config, validateConfig } from './config/index.js';
import { handleMessage, handleAppMention, handleHelpCommand } from './handlers/index.js';

// Validate configuration before starting
validateConfig();

// Determine if we should use Socket Mode or HTTP mode
const useSocketMode = !!config.slack.appToken;

// Whether to require @mention in channels/groups (similar to Teams bot behavior)
// Set to false to respond to all messages in channels where bot is added
const requireMentionInChannels = config.slack.requireMentionInChannels;

// Initialize the Slack Bolt app config
const appConfig = {
  token: config.slack.botToken,
};

// Socket Mode vs HTTP Mode configuration
if (useSocketMode) {
  // Socket Mode: uses WebSocket, no signing secret needed
  appConfig.socketMode = true;
  appConfig.appToken = config.slack.appToken;
  console.log('[App] Running in Socket Mode');
} else {
  // HTTP Mode: requires signing secret for request verification
  appConfig.signingSecret = config.slack.signingSecret;
  console.log('[App] Running in HTTP Mode');
}

const app = new App(appConfig);

// ============================================
// Event Handlers
// ============================================

// Handle all messages (DMs, channels, groups)
app.message(async (args) => {
  const { message, context } = args;
  
  // Ignore bot messages, message edits, and thread replies (optional)
  if (message.bot_id || message.subtype) {
    return;
  }

  const channelType = message.channel_type;
  
  // DMs: always respond
  if (channelType === 'im') {
    console.log('[App] Handling DM message');
    await handleMessage(args);
    return;
  }
  
  // Channels & Groups: check if mention is required
  if (channelType === 'channel' || channelType === 'group' || channelType === 'mpim') {
    if (requireMentionInChannels) {
      // Only respond if bot is mentioned (handled by app_mention event)
      console.log('[App] Channel/group message - mention required, skipping');
      return;
    }
    
    // Respond to all messages in channels/groups
    console.log(`[App] Handling ${channelType} message`);
    await handleMessage(args);
  }
});

// Handle @mentions of the bot in channels/groups
app.event('app_mention', handleAppMention);

// ============================================
// Slash Commands
// ============================================

// /ejento-help command
app.command('/ejento-help', handleHelpCommand);

// ============================================
// Error Handler
// ============================================

app.error(async (error) => {
  console.error('[App] Global error handler:', error);
});

// ============================================
// Start the App
// ============================================

(async () => {
  try {
    // Socket Mode doesn't need a port, HTTP mode does
    if (useSocketMode) {
      await app.start();
    } else {
      await app.start(config.slack.port);
    }
    
    console.log('⚡️ Ejento Slack Bot is running!');
    console.log(`   Mode: ${useSocketMode ? 'Socket Mode' : 'HTTP Mode'}`);
    if (!useSocketMode) {
      console.log(`   Port: ${config.slack.port}`);
    }
    console.log(`   Default Agent: ${config.agent.defaultAgentId || 'Not configured'}`);
  } catch (error) {
    console.error('[App] Failed to start:', error);
    process.exit(1);
  }
})();

