/**
 * Simple in-memory token cache for user access tokens
 * Tokens are cached with expiration to avoid unnecessary API calls
 */

const TOKEN_EXPIRY_MS = 55 * 60 * 1000; // 55 minutes (tokens typically expire in 1 hour)

const tokenCache = new Map();

/**
 * Get or create an access token for a user
 * @param {string} userId - Slack user ID
 * @param {Function} createTokenFn - Function to create a new token
 * @param {object} userInfo - User info object { email, fullName }
 * @returns {Promise<string>} Access token
 */
async function getUserAccessToken(userId, createTokenFn, userInfo) {
  const cached = tokenCache.get(userId);

  // Return cached token if still valid
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[TokenCache] Using cached token for user ${userId}`);
    return cached.token;
  }

  // Create new token
  console.log(`[TokenCache] Creating new token for user ${userId}`);
  const tokenResponse = await createTokenFn(userInfo.email, userInfo.fullName);
  const token = tokenResponse.access_token;
  const ejentoUserId = tokenResponse.user_id;

  // Cache the token and user_id
  tokenCache.set(userId, {
    token,
    ejentoUserId,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
  });

  return token;
}

/**
 * Get the Ejento user ID for a Slack user
 * @param {string} userId - Slack user ID
 * @returns {number|undefined} Ejento user ID
 */
function getUserEjentoId(userId) {
  const cached = tokenCache.get(userId);
  return cached?.ejentoUserId;
}

/**
 * Clear a user's cached token
 * @param {string} userId - Slack user ID
 */
function clearUserToken(userId) {
  tokenCache.delete(userId);
}

/**
 * Clear all cached tokens
 */
function clearAllTokens() {
  tokenCache.clear();
}

export {
  getUserAccessToken,
  getUserEjentoId,
  clearUserToken,
  clearAllTokens,
};

