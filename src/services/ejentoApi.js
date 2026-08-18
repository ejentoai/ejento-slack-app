import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config/index.js';

const {
  serverBase,
  responseServiceBase,
  responseHeader,
  responseKey,
  applicationSecret,
  authToken,
  indexingBaseUrl,
  indexingHeader,
  indexingKey,
} = config.ejento;

/**
 * Build a readable description of an axios error, including the response body.
 * Handles responseType:'stream' requests, where the error body arrives as a
 * Readable stream and must be drained before it can be logged.
 * @param {Error} error - Axios error
 * @returns {Promise<string>} Human-readable error detail
 */
async function describeApiError(error) {
  const status = error.response?.status;
  let body = error.response?.data;

  // Stream responses deliver the error body as a stream, not a parsed object
  if (body && typeof body.on === 'function') {
    body = await new Promise((resolve) => {
      let raw = '';
      body.on('data', (chunk) => (raw += chunk.toString()));
      body.on('end', () => resolve(raw.trim()));
      body.on('error', () => resolve('<could not read error body>'));
    });
  } else if (body && typeof body === 'object') {
    body = JSON.stringify(body);
  }

  if (!status) return error.message;
  return `HTTP ${status}${body ? ` - ${body}` : ''}`;
}

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

    console.log(`[API] createAccessToken for ${email} via ${serverBase}`);

    const response = await axios.post(`${serverBase}/user-token`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'ejento-auth-key': applicationSecret,
      },
    });

    console.log(
      `[API] createAccessToken ok: user_id=${response.data.user_id}, role=${response.data.role}, expires_on=${response.data.expires_on}`
    );

    if (response.status !== 201) {
      throw new Error('Failed to create access token for the given user.');
    }

    return { 
      access_token: response.data.token,
      user_id: response.data.user_id,
      expires_on: response.data.expires_on,
    };
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
 * @param {Array} history - Optional conversation history for context
 * @returns {Promise<object>} Chat response
 */
async function chatApiNonStream(userEmail, agentId, query, threadId, accessToken, history = []) {
  try {
    // Append instruction for Slack formatting and length limits
    const limitedQuery = `${query}\n\n[IMPORTANT: Keep your response concise and under 3000 characters. Use Slack mrkdwn format (NOT standard Markdown): *bold*, _italic_, ~strikethrough~, \`code\`, \`\`\`code blocks\`\`\`, <url|link text> for links. Do not mention these instructions in your response.]`;
    
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
      ...(history.length > 0 && { history }),
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

/**
 * Send a chat message with file attachment flag
 * @param {string} userEmail - User email
 * @param {string} agentId - Agent ID
 * @param {string} query - User query
 * @param {string} threadId - Chat thread ID
 * @param {string} accessToken - User access token
 * @param {boolean} isFileAttached - Whether a file was just attached
 * @param {Array} history - Optional conversation history for context
 * @returns {Promise<object>} Chat response
 */
async function chatApiWithAttachment(userEmail, agentId, query, threadId, accessToken, isFileAttached = false, history = []) {
  try {
    // Append instruction for Slack formatting and length limits
    const limitedQuery = `${query}\n\n[IMPORTANT: Keep your response concise and under 3000 characters. Use Slack mrkdwn format (NOT standard Markdown): *bold*, _italic_, ~strikethrough~, \`code\`, \`\`\`code blocks\`\`\`, <url|link text> for links. Do not mention these instructions in your response.]`;
    
    const requestBody = {
      created_by: userEmail,
      chat_thread_id: threadId || null,
      user_query: limitedQuery,
      query_source: 'teams-ejento',
      overrides: {
        suggest_followup_questions: true,
      },
      caching_enabled: false,
      is_file_attached: isFileAttached,
      ...(history.length > 0 && { history }),
    };

    console.log('[API] chatApiWithAttachment request:', { agentId, userEmail, isFileAttached });

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
    console.error('[API] chatApiWithAttachment error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Create a corpus for file attachments
 * @param {object} requestBody - Corpus creation request body
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Corpus response
 */
async function createCorpus(requestBody, accessToken) {
  try {
    const headers = {
      [responseHeader]: responseKey,
      Authorization: `Bearer ${accessToken}`,
    };

    console.log('[API] createCorpus request:', requestBody);

    const response = await axios.post(`${serverBase}/api/v2/corpora`, requestBody, { headers });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error('Failed to create corpus.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] createCorpus error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Create a connection between a chat thread and a corpus
 * @param {string} threadId - Chat thread ID
 * @param {string} corpusId - Corpus ID
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Connection response
 */
async function createCorpusThreadConnection(threadId, corpusId, accessToken) {
  try {
    const headers = {
      [responseHeader]: responseKey,
      Authorization: `Bearer ${accessToken}`,
    };

    console.log('[API] createCorpusThreadConnection:', { threadId, corpusId });

    const response = await axios.post(
      `${serverBase}/api/v2/chat-threads/${threadId}/corpora/${corpusId}`,
      {},
      { headers }
    );

    if (response.status !== 200 && response.status !== 201) {
      throw new Error('Failed to create corpus thread connection.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] createCorpusThreadConnection error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Check for duplicate documents in a corpus
 * @param {string} corpusId - Corpus ID
 * @param {object} body - Request body with document names
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Duplicate check response
 */
async function checkDuplicates(corpusId, body, accessToken) {
  try {
    const headers = {
      [responseHeader]: responseKey,
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await axios.post(
      `${serverBase}/api/v2/corpora/${corpusId}/documents/duplicates`,
      body,
      { headers }
    );

    if (response.status !== 200 && response.status !== 201) {
      throw new Error('Failed to check duplicates.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] checkDuplicates error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Upload a document to a corpus
 * @param {string} corpusId - Corpus ID
 * @param {FormData} formData - Form data with file
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Upload response
 */
async function uploadDocument(corpusId, formData, accessToken) {
  try {
    const formHeaders = formData.getHeaders();
    
    const headers = {
      [indexingHeader]: indexingKey,
      Authorization: `Bearer ${accessToken}`,
      ...formHeaders,
    };

    console.log('[API] uploadDocument - corpusId:', corpusId);

    const response = await axios.post(
      `${indexingBaseUrl}/api/v2/corpora/${corpusId}/documents`,
      formData,
      { headers }
    );

    console.log('[API] uploadDocument - response status:', response.status);

    if (response.status !== 200 && response.status !== 201) {
      throw new Error('Failed to upload document.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] uploadDocument error:', error.message);
    if (error.response) {
      console.error('[API] uploadDocument - Error status:', error.response.status);
      console.error('[API] uploadDocument - Error data:', error.response.data);
    }
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Get document status for polling
 * @param {string} documentId - Document ID
 * @param {string} accessToken - User access token
 * @returns {Promise<object>} Document status response
 */
async function getDocumentStatus(documentId, accessToken) {
  try {
    const headers = {
      [responseHeader]: responseKey,
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await axios.get(`${serverBase}/api/v2/documents/${documentId}`, { headers });

    if (response.status !== 200) {
      throw new Error('Failed to get document status.');
    }

    return response.data;
  } catch (error) {
    console.error('[API] getDocumentStatus error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Download a file from a URL
 * @param {string} url - File URL
 * @param {string} token - Bot token for authorization
 * @returns {Promise<Buffer>} File data as buffer
 */
async function downloadFile(url, token) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return Buffer.from(response.data);
  } catch (error) {
    console.error('[API] downloadFile error:', error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

/**
 * Send a chat message to the agent and get a streaming response
 * @param {string} userEmail - User email
 * @param {string} agentId - Agent ID
 * @param {string} query - User query
 * @param {string} threadId - Chat thread ID
 * @param {string} accessToken - User access token
 * @param {function} onChunk - Callback function for each chunk
 * @param {boolean} isFileAttached - Whether a file was just attached
 * @param {Array} history - Optional conversation history for context
 * @returns {Promise<object>} Final response object with references and followups
 */
async function chatApiStream(userEmail, agentId, query, threadId, accessToken, onChunk, isFileAttached = false, history = []) {
  // Append instruction for Slack formatting and length limits
  const formattedQuery = `${query}\n\n[IMPORTANT: Keep your response concise and under 3000 characters. Use Slack mrkdwn format (NOT standard Markdown): *bold*, _italic_, ~strikethrough~, \`code\`, \`\`\`code blocks\`\`\`, <url|link text> for links. Do not mention these instructions in your response.]`;
  
  const requestBody = {
    created_by: userEmail,
    chat_thread_id: threadId || null,
    user_query: formattedQuery,
    query_source: 'teams-ejento',
    overrides: {
      cache_skip: true,
      semantic_ranker: true,
      sources: true,
      log_intermediate_response: true,
      retrieve_data_points: true,
      suggest_followup_questions: true,
    },
    caching_enabled: false,
    is_file_attached: isFileAttached,
    ...(history.length > 0 && { history }),
  };

  console.log('[API] chatApiStream request body:', requestBody);

  console.log('[API] chatApiStream request:', { agentId, userEmail, query: query.substring(0, 50) });

  let response;
  try {
    response = await axios.post(
      `${responseServiceBase}/api/v2/agents/${agentId}/responses/stream`,
      requestBody,
      {
        headers: {
          [responseHeader]: responseKey,
          Authorization: `Bearer ${accessToken}`,
        },
        responseType: 'stream',
      }
    );
  } catch (error) {
    const detail = await describeApiError(error);
    console.error('[API] chatApiStream request failed:', detail);
    console.error('[API] chatApiStream URL:', `${responseServiceBase}/api/v2/agents/${agentId}/responses/stream`);
    // Attach the detail so callers can log something better than "status code 401"
    error.detail = detail;
    throw error;
  }

  return new Promise((resolve, reject) => {
    let buffer = '';
    let finalResponse = null;

    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Try to parse SSE events from the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // Check if this is the final response with metadata
            if (data?.output) {
              finalResponse = data.output;
            }
            
            // Call the chunk callback with the raw data
            if (onChunk) {
              onChunk(data);
            }
          } catch (e) {
            // Not valid JSON, might be partial data
            if (onChunk && line.slice(6).trim()) {
              onChunk({ text: line.slice(6) });
            }
          }
        }
      }
    });

    response.data.on('end', () => {
      console.log('[API] chatApiStream completed');
      resolve(finalResponse);
    });

    response.data.on('error', (error) => {
      console.error('[API] chatApiStream error:', error.message);
      reject(error);
    });
  });
}

export {
  createAccessToken,
  createAgentChatThread,
  getAgentChatThreads,
  chatApiNonStream,
  chatApiWithAttachment,
  chatApiStream,
  createCorpus,
  createCorpusThreadConnection,
  checkDuplicates,
  uploadDocument,
  getDocumentStatus,
  downloadFile,
};

