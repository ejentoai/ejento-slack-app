/**
 * Slack-specific helper utilities
 */

/**
 * Format a response message for Slack with optional references
 * @param {string} answer - The answer text
 * @param {Array} references - Optional array of reference objects
 * @returns {Array} Slack blocks array
 */
function formatResponseBlocks(answer, references = []) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: answer,
      },
    },
  ];

  // Add references/sources if available
  if (references && references.length > 0) {
    blocks.push({
      type: 'divider',
    });

    const sourcesList = references
      .slice(0, 5) // Limit to 5 sources
      .map((ref, idx) => `${idx + 1}. ${ref.url || ref.title || 'Source'}`)
      .join('\n');

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📚 *Sources:*\n${sourcesList}`,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Format an error message for Slack
 * @param {string} message - Error message
 * @returns {Array} Slack blocks array
 */
function formatErrorBlocks(message) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *Error:* ${message}`,
      },
    },
  ];
}

/**
 * Format a loading/thinking message
 * @returns {Array} Slack blocks array
 */
function formatThinkingBlocks() {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🤔 *Thinking...* Let me find the right information for you.',
      },
    },
  ];
}

/**
 * Extract user info from Slack user object
 * @param {object} user - Slack user object from users.info API
 * @returns {object} Normalized user info
 */
function extractUserInfo(user) {
  const profile = user.profile || {};
  
  return {
    id: user.id,
    email: profile.email || `${user.id}@slack.user`,
    firstName: profile.first_name || profile.display_name || user.name || 'Slack',
    lastName: profile.last_name || 'User',
    fullName: profile.real_name || profile.display_name || user.name || 'Slack User',
    displayName: profile.display_name || user.name,
  };
}

export {
  formatResponseBlocks,
  formatErrorBlocks,
  formatThinkingBlocks,
  extractUserInfo,
};

