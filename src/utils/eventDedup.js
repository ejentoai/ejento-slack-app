/**
 * In-memory guard against processing the same Slack event twice.
 *
 * In HTTP mode Slack redelivers an event if it doesn't receive a 200 within
 * 3 seconds, retrying up to 3 times over roughly 30 minutes. A redelivery
 * carries the same event_id, so tracking seen ids is enough to drop it.
 *
 * Without this, a retry re-runs the whole handler - which for a file_share
 * means indexing the same document into the corpus again and posting a
 * duplicate answer.
 */

// Covers Slack's full retry window
const SEEN_TTL_MS = 30 * 60 * 1000;

// event_id -> timestamp after which the entry can be dropped
const seenEvents = new Map();

/**
 * Record an event id and report whether it has been seen before.
 * @param {string} eventId - Slack event_id from the request body
 * @returns {boolean} True if this event was already processed
 */
function isDuplicateEvent(eventId) {
  // No id (e.g. Socket Mode payloads without one) - nothing to dedupe on
  if (!eventId) return false;

  const now = Date.now();

  if (seenEvents.has(eventId)) {
    return seenEvents.get(eventId) > now;
  }

  // Prune expired entries so the map can't grow without bound
  for (const [id, expiresAt] of seenEvents) {
    if (expiresAt <= now) seenEvents.delete(id);
  }

  seenEvents.set(eventId, now + SEEN_TTL_MS);
  return false;
}

export { isDuplicateEvent };
