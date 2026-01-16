import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  // Slack Configuration
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN, // For Socket Mode
    port: parseInt(process.env.PORT || '3000', 10),
    // If true, bot only responds to @mentions in channels/groups
    // If false, bot responds to all messages in channels where it's added
    requireMentionInChannels: process.env.REQUIRE_MENTION_IN_CHANNELS !== 'false', // Default: true
  },

  // Ejento API Configuration
  ejento: {
    serverBase: process.env.SERVER_BASE,
    responseServiceBase: process.env.RESPONSE_SERVICE_BASE_URL,
    responseHeader: process.env.RESPONSE_SERVICE_HEADER,
    responseKey: process.env.RESPONSE_SERVICE_KEY,
    applicationSecret: process.env.EJENTO_APPLICATION_SECRET,
    authToken: process.env.AUTH_TOKEN,
  },

  // Default Agent Configuration
  agent: {
    defaultAgentId: process.env.DEFAULT_AGENT,
    defaultAgentName: process.env.DEFAULT_AGENT_NAME,
    defaultProject: process.env.SLACK_PROJECT,
  },
};

// Validate required configuration
const validateConfig = () => {
  const useSocketMode = !!config.slack.appToken;

  const required = [
    ['SLACK_BOT_TOKEN', config.slack.botToken],
    ['SERVER_BASE', config.ejento.serverBase],
    ['RESPONSE_SERVICE_BASE_URL', config.ejento.responseServiceBase],
    ['EJENTO_APPLICATION_SECRET', config.ejento.applicationSecret],
  ];

  // Socket Mode requires appToken, HTTP Mode requires signingSecret
  if (useSocketMode) {
    required.push(['SLACK_APP_TOKEN', config.slack.appToken]);
  } else {
    required.push(['SLACK_SIGNING_SECRET', config.slack.signingSecret]);
  }

  const missing = required.filter(([name, value]) => !value);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(([name]) => console.error(`  - ${name}`));
    if (!useSocketMode) {
      console.error('\nTip: For Socket Mode (no public URL needed), set SLACK_APP_TOKEN instead of SLACK_SIGNING_SECRET');
    }
    process.exit(1);
  }
};

export { config, validateConfig };

