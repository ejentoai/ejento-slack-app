# Ejento Slack Bot

A Slack bot that integrates with the Ejento AI platform, allowing users to interact with Ejento agents directly from Slack.

## Features

- **Direct Messages**: Chat with the bot in DMs for private conversations
- **Channel Mentions**: Mention the bot with `@Ejento` in channels to ask questions
- **Slash Commands**: Use `/ejento-help` to get help information
- **Smart Responses**: Get AI-powered answers with source references
- **Follow-up Suggestions**: Receive suggested follow-up questions

## Prerequisites

- Node.js 18+ 
- A Slack workspace with admin access
- An Ejento account with API access

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ejento-slack-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables** (see [Configuration](#configuration))

5. **Start the bot**
   ```bash
   # Development (with auto-reload)
   npm run dev
   
   # Production
   npm start
   ```

## Configuration

Create a `.env` file in the root directory with the following variables:

### Slack Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Bot User OAuth Token (starts with `xoxb-`) |
| `SLACK_APP_TOKEN` | For Socket Mode | App-Level Token (starts with `xapp-`) |
| `SLACK_SIGNING_SECRET` | For HTTP Mode | Signing secret for request verification |
| `PORT` | No | HTTP server port (default: 3000) |
| `REQUIRE_MENTION_IN_CHANNELS` | No | If `false`, bot responds to all channel messages (default: `true`) |

### Ejento API Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVER_BASE` | Yes | Ejento server base URL |
| `RESPONSE_SERVICE_BASE_URL` | Yes | Ejento response service URL |
| `RESPONSE_SERVICE_HEADER` | No | Custom header name for response service |
| `RESPONSE_SERVICE_KEY` | No | API key for response service |
| `EJENTO_APPLICATION_SECRET` | Yes | Application secret for authentication |
| `AUTH_TOKEN` | No | Additional auth token if required |

### Agent Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DEFAULT_AGENT` | No | Default agent ID to use for queries |
| `DEFAULT_AGENT_NAME` | No | Display name for the default agent |
| `SLACK_PROJECT` | No | Project identifier for Slack integration |

### Example `.env` file

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
PORT=3000

# Ejento API Configuration
SERVER_BASE=https://api.ejento.com
RESPONSE_SERVICE_BASE_URL=https://response.ejento.com
EJENTO_APPLICATION_SECRET=your-application-secret

# Agent Configuration
DEFAULT_AGENT=your-agent-id
DEFAULT_AGENT_NAME=Ejento Assistant
```

## Slack App Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Enter app name and select your workspace

### 2. Configure Bot Token Scopes

Navigate to **OAuth & Permissions** and add these **Bot Token Scopes**:

- `app_mentions:read` - Receive @mention events
- `channels:history` - Read messages in public channels
- `chat:write` - Send messages
- `commands` - Handle slash commands
- `groups:history` - Read messages in private channels
- `im:history` - Read direct messages
- `mpim:history` - Read group DMs
- `users:read` - Get user information
- `users:read.email` - Get user email addresses

### 3. Enable Socket Mode (Recommended)

1. Go to **Socket Mode** in the sidebar
2. Enable Socket Mode
3. Generate an **App-Level Token** with `connections:write` scope
4. Copy the token (starts with `xapp-`) to your `.env` as `SLACK_APP_TOKEN`

### 4. Subscribe to Events

Navigate to **Event Subscriptions**:

1. Enable Events
2. Subscribe to these **bot events**:
   - `app_mention` - When someone mentions your bot
   - `message.channels` - Messages in public channels
   - `message.groups` - Messages in private channels
   - `message.im` - Direct messages
   - `message.mpim` - Group direct messages

### 5. Create Slash Command

Navigate to **Slash Commands** and create:

- Command: `/ejento-help`
- Description: Get help with Ejento bot
- Usage Hint: (leave empty)

### 6. Install the App

1. Go to **Install App** in the sidebar
2. Click **Install to Workspace**
3. Authorize the requested permissions
4. Copy the **Bot User OAuth Token** to your `.env` as `SLACK_BOT_TOKEN`

## Project Structure

```
ejento-slack-bot/
├── src/
│   ├── index.js              # App entry point
│   ├── config/
│   │   └── index.js          # Configuration management
│   ├── handlers/
│   │   ├── index.js          # Handler exports
│   │   ├── messageHandler.js # Message & mention handling
│   │   └── commandHandler.js # Slash command handling
│   ├── services/
│   │   └── ejentoApi.js      # Ejento API client
│   └── utils/
│       ├── slackHelpers.js   # Slack formatting utilities
│       └── tokenCache.js     # User token caching
├── .env                      # Environment variables (not in git)
├── .env.example              # Example environment file
├── package.json
└── README.md
```

## Usage

### Direct Messages

Simply send a message to the bot in a DM conversation:

```
What is our company's vacation policy?
```

### Channel Mentions

Mention the bot in any channel it's been added to:

```
@Ejento How do I submit an expense report?
```

### Slash Commands

```
/ejento-help
```

## Development

```bash
# Run with auto-reload
npm run dev

# Run production
npm start
```

## Troubleshooting

### "missing_scope" Error

Your bot token doesn't have required permissions. Add the missing scope in **OAuth & Permissions** and reinstall the app.

### "msg_too_long" Error

The response from Ejento exceeds Slack's message limits. Consider implementing response truncation or splitting.

### "Invalid access token" Error

The Ejento access token has expired or is invalid. Check your `EJENTO_APPLICATION_SECRET` configuration.

### Bot Not Responding

1. Check that the bot is running (`npm run dev`)
2. Verify Socket Mode is enabled and `SLACK_APP_TOKEN` is set
3. Ensure the bot is invited to the channel
4. Check console logs for errors

## License

ISC




