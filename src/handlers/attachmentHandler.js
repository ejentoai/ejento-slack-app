/**
 * Handler for file attachments in Slack
 * Supports indexing files uploaded to conversations
 */

import FormData from 'form-data';
import { config } from '../config/index.js';
import {
  createAccessToken,
  createAgentChatThread,
  getAgentChatThreads,
  createCorpus,
  createCorpusThreadConnection,
  checkDuplicates,
  uploadDocument,
  getDocumentStatus,
  downloadFile,
} from '../services/ejentoApi.js';
import { getUserAccessToken, getUserEjentoId } from '../utils/tokenCache.js';
import { extractUserInfo } from '../utils/slackHelpers.js';

const { defaultAgentId } = config.agent;

/**
 * Supported file types for indexing
 */
const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
];

/**
 * Check if a file type is supported for indexing
 * @param {string} mimeType - File MIME type
 * @returns {boolean} Whether the file type is supported
 */
function isSupportedFileType(mimeType) {
  return SUPPORTED_FILE_TYPES.includes(mimeType) || 
         mimeType?.startsWith('text/') ||
         mimeType?.includes('pdf') ||
         mimeType?.includes('document');
}

/**
 * Handle file attachment indexing
 * @param {object} params - Handler parameters
 * @param {object} params.message - Slack message object
 * @param {object} params.client - Slack client
 * @param {Function} params.say - Say function
 * @param {object} params.file - File object from Slack
 * @param {string} params.userQuery - Optional user query to process after indexing
 * @returns {Promise<object>} Result with indexing status and optional message
 */
async function handleFileAttachment({ message, client, say, file, userQuery }) {
  const userId = message.user;
  const channelId = message.channel;

  console.log(`[AttachmentHandler] Processing file: ${file.name} (${file.mimetype})`);

  try {
    // Check if file type is supported
    if (!isSupportedFileType(file.mimetype)) {
      console.log(`[AttachmentHandler] Unsupported file type: ${file.mimetype}`);
      await say({
        text: `⚠️ Sorry, I can't index **${file.name}**. Supported formats: PDF, Word, Excel, PowerPoint, and text files.`,
        thread_ts: message.ts,
      });
      return { indexingCompleted: false, message: userQuery };
    }

    // Send initial notification
    const statusMessage = await say({
      text: `📄 Starting to index **${file.name}**... Please wait.`,
      thread_ts: message.ts,
    });

    // Get user info from Slack
    const userInfoResponse = await client.users.info({ user: userId });
    const userInfo = extractUserInfo(userInfoResponse.user);

    // Get or create access token
    const accessToken = await getUserAccessToken(userId, createAccessToken, {
      email: userInfo.email,
      fullName: userInfo.fullName,
    });

    // Get Ejento user ID
    const ejentoUserId = getUserEjentoId(userId);

    // Get or create chat thread
    const agentId = defaultAgentId;
    let threadId;
    let threadResponse;

    try {
      const chatThreads = await getAgentChatThreads(agentId, accessToken);
      
      if (chatThreads?.data?.chat_threads?.length > 0) {
        threadResponse = chatThreads.data.chat_threads[0];
        threadId = threadResponse.id;
        console.log(`[AttachmentHandler] Using existing thread: ${threadId}`);
      } else {
        const newThread = await createAgentChatThread(agentId, accessToken);
        threadResponse = newThread.data;
        threadId = threadResponse.id;
        console.log(`[AttachmentHandler] Created new thread: ${threadId}`);
      }
    } catch (threadError) {
      console.error('[AttachmentHandler] Error with chat thread:', threadError.message);
      throw new Error('Failed to get or create chat thread');
    }

    // Check if corpus exists, create if not
    let corpusId = threadResponse.corpus_id;

    if (!corpusId) {
      console.log('[AttachmentHandler] Creating new corpus for attachments');
      const corpusRequestBody = {
        name: `AttachmentCorpus-${threadId}`,
        description: 'Slack Attachment Corpus',
        indexing_mode_id: 3,
        corpus_type: 'attachment',
      };

      const corpusResponse = await createCorpus(corpusRequestBody, accessToken);
      corpusId = corpusResponse?.data?.id;

      // Create corpus-thread connection
      await createCorpusThreadConnection(threadId, corpusId, accessToken);
      console.log(`[AttachmentHandler] Created corpus: ${corpusId}`);
    }

    // Sanitize filename
    const sanitizedFilename = file.name
      .replace(/\s*\([^)]*\)/g, '') // Remove (1), (2), etc.
      .replace(/\s+/g, ' ')          // Normalize multiple spaces
      .trim();

    // Check for duplicates
    const duplicateCheckBody = { documents: [sanitizedFilename] };
    const duplicateResponse = await checkDuplicates(corpusId.toString(), duplicateCheckBody, accessToken);

    if (duplicateResponse?.data?.duplicate_files?.length > 0) {
      console.log('[AttachmentHandler] File already exists in corpus');
      await client.chat.update({
        channel: channelId,
        ts: statusMessage.ts,
        text: `✅ **${file.name}** is already indexed and ready to use!`,
      });
      return { indexingCompleted: true, message: userQuery, alreadyIndexed: true };
    }

    // Download the file from Slack
    console.log(`[AttachmentHandler] Downloading file from Slack: ${file.url_private}`);
    const fileData = await downloadFile(file.url_private, config.slack.botToken);
    console.log(`[AttachmentHandler] File downloaded: ${fileData.length} bytes`);

    // Prepare form data for upload
    const formData = new FormData();
    formData.append('user_id', ejentoUserId?.toString() || '');
    formData.append('content_type', 'file');
    formData.append('upload_from', 'web');
    formData.append('attachment', 'true');
    formData.append('source', fileData, sanitizedFilename);

    // Upload document
    console.log('[AttachmentHandler] Uploading document to corpus');
    const uploadResponse = await uploadDocument(corpusId, formData, accessToken);
    const documentId = uploadResponse?.data?.id;

    if (!documentId) {
      throw new Error('Failed to get document ID from upload response');
    }

    // Poll for indexing completion
    const indexingResult = await pollDocumentStatus(documentId, accessToken, file.name);

    // Update status message
    if (indexingResult.success) {
      await client.chat.update({
        channel: channelId,
        ts: statusMessage.ts,
        text: `✅ **${file.name}** has been indexed successfully and is ready to use!`,
      });
    } else {
      await client.chat.update({
        channel: channelId,
        ts: statusMessage.ts,
        text: `❌ Indexing failed for **${file.name}**. Please try again.`,
      });
    }

    return { 
      indexingCompleted: indexingResult.success, 
      message: userQuery,
      threadId,
    };

  } catch (error) {
    console.error('[AttachmentHandler] Error:', error.message);
    await say({
      text: `❌ Sorry, I couldn't index **${file.name}**. Error: ${error.message}`,
      thread_ts: message.ts,
    });
    return { indexingCompleted: false, message: userQuery, error: error.message };
  }
}

/**
 * Poll document status until indexing is complete
 * @param {string} documentId - Document ID
 * @param {string} accessToken - Access token
 * @param {string} fileName - File name for logging
 * @returns {Promise<object>} Polling result
 */
async function pollDocumentStatus(documentId, accessToken, fileName) {
  const maxAttempts = 18; // 18 attempts × 10 seconds = 180 seconds (3 minutes)
  const pollInterval = 10000; // 10 seconds
  let attempts = 0;

  return new Promise((resolve) => {
    const poll = async () => {
      try {
        attempts++;
        console.log(`[AttachmentHandler] Polling attempt ${attempts}/${maxAttempts} for document: ${documentId}`);
        
        const documentResponse = await getDocumentStatus(documentId, accessToken);
        const file = documentResponse?.data;

        if (file?.step === 'uploaded' || file?.step === 'completed') {
          if (!file?.is_failed) {
            console.log(`[AttachmentHandler] ✅ Indexing completed for: ${fileName}`);
            resolve({ success: true });
            return;
          }
        }

        if (file?.is_failed) {
          console.log(`[AttachmentHandler] ❌ Indexing failed for: ${fileName}`);
          resolve({ success: false, error: 'Indexing failed' });
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          console.log(`[AttachmentHandler] Max attempts reached for: ${fileName}`);
          resolve({ success: false, error: 'Timeout' });
        }
      } catch (error) {
        console.error('[AttachmentHandler] Polling error:', error.message);
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          resolve({ success: false, error: error.message });
        }
      }
    };

    poll();
  });
}

/**
 * Check if a message has file attachments
 * @param {object} message - Slack message object
 * @returns {boolean} Whether message has files
 */
function hasFileAttachments(message) {
  return message.files && message.files.length > 0;
}

/**
 * Get supported files from a message
 * @param {object} message - Slack message object
 * @returns {Array} Array of supported file objects
 */
function getSupportedFiles(message) {
  if (!message.files) return [];
  return message.files.filter(file => isSupportedFileType(file.mimetype));
}

export {
  handleFileAttachment,
  hasFileAttachments,
  getSupportedFiles,
  isSupportedFileType,
};


