import axios from 'axios';
import { config } from '../config/index.js';

const {
  serverBase,
  responseServiceBase,
  responseHeader,
  responseKey,
  applicationSecret,
  authToken,
} = config.ejento;

/**
 * Create an access token for a user
 * @param {string} email - User email
 * @param {string} fullName - User full name
 * @returns {Promise<object>} Access token response
 */
async function createAccessToken(email, fullName) {
  try {
    const requestBody = {
      email,
      full_name: fullName,
    };

    console.log('applicationSecret', applicationSecret, 'serverBase', serverBase);
    console.log('requestBody', requestBody);

    const response = await axios.post(`${serverBase}/user-token`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'ejento-auth-key': applicationSecret,
      },
    });

    console.log('response', response.data);

    if (response.status !== 201) {
      throw new Error('Failed to create access token for the given user.');
    }

    return { access_token: response.data.token };
  } catch (error) {
    console.error('[API] createAccessToken error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Create a chat thread for an agent
 * @param {string} agentId - Agent ID
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Chat thread response
 */
async function createAgentChatThread(agentId, accessToken) {
  try {
    const headers = {
      [responseHeader]: responseKey,
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await axios.post(
      `${serverBase}/api/v2/agents/${agentId}/chat-threads`,
      {},
      { headers }
    );

    if (response.status !== 200 && response.status !== 201) {
      throw new Error('Failed to create chat thread for the agent.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] createAgentChatThread error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Get existing chat threads for an agent
 * @param {string} agentId - Agent ID
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Chat threads response
 */
async function getAgentChatThreads(agentId, accessToken) {
  try {
    const headers = {
      [responseHeader]: responseKey,
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await axios.get(
      `${serverBase}/api/v2/agents/${agentId}/chat-threads?query_source=slack-ejento`,
      { headers }
    );

    if (response.status !== 200) {
      throw new Error('Failed to get chat threads for the agent.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] getAgentChatThreads error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Send a chat message to the agent and get a response (non-streaming)
 * @param {string} userEmail - User email
 * @param {string} agentId - Agent ID
 * @param {string} query - User query
 * @param {string} threadId - Chat thread ID
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Chat response
 */
async function chatApiNonStream(userEmail, agentId, query, threadId, accessToken) {
  try {
    // Append instruction to limit response length for Slack's message limits
    const limitedQuery = `${query}\n\n[IMPORTANT: Keep your response concise and under 3000 characters to fit Slack's message limits.]`;
    
    const requestBody = {
      created_by: userEmail,
      chat_thread_id: threadId || null,
      user_query: limitedQuery,
      query_source: 'teams-ejento',
      overrides: {
        suggest_followup_questions: true,
      },
      caching_enabled: false,
      is_file_attached: false,
    };

    console.log('[API] chatApiNonStream request:', { agentId, userEmail, query: query.substring(0, 50) });

    const response = await axios.post(
      `${responseServiceBase}/api/v2/agents/${agentId}/responses`,
      requestBody,
      {
        headers: {
          [responseHeader]: responseKey,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error('Failed to fetch query response for the given user.');
    }

    return response.data?.data;
  } catch (error) {
    console.error('[API] chatApiNonStream error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

export {
  createAccessToken,
  createAgentChatThread,
  getAgentChatThreads,
  chatApiNonStream,
};

