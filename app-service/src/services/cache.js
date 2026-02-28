const invalidatedSessions = new Map();

function addInvalidation(sessionId, expiration) {
  invalidatedSessions.set(sessionId, expiration);
}

function isInvalidated(sessionId) {
  return invalidatedSessions.has(sessionId);
}

function cleanup() {
  const now = Math.floor(Date.now() / 1000);
  for (const [sessionId, expiration] of invalidatedSessions) {
    if (expiration < now) {
      invalidatedSessions.delete(sessionId);
    }
  }
}

let cleanupInterval;

function startCleanup() {
  cleanupInterval = setInterval(cleanup, 30_000);
}

function stopCleanup() {
  if (cleanupInterval) clearInterval(cleanupInterval);
}

function getSize() {
  return invalidatedSessions.size;
}

module.exports = { addInvalidation, isInvalidated, cleanup, startCleanup, stopCleanup, getSize };
