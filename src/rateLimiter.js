'use strict';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // failed attempts must fall within this window to count together
const LOCKOUT_MS = 15 * 60 * 1000; // how long a key stays locked out once tripped
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // periodic cleanup of stale entries

const store = new Map(); // key -> { attempts: number[], lockedUntil: number|null }

function isLocked(key) {
  const entry = store.get(key);
  if (!entry) return { locked: false };

  if (entry.lockedUntil) {
    if (Date.now() < entry.lockedUntil) {
      return { locked: true, retryAfterMs: entry.lockedUntil - Date.now() };
    }
    // lockout has expired — clear the slate for this key
    store.delete(key);
    return { locked: false };
  }

  return { locked: false };
}

function recordFailure(key) {
  const now = Date.now();
  const entry = store.get(key) || { attempts: [], lockedUntil: null };
  entry.attempts = entry.attempts.filter((t) => now - t < WINDOW_MS);
  entry.attempts.push(now);
  if (entry.attempts.length >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  store.set(key, entry);
}

function recordSuccess(key) {
  store.delete(key);
}

function sweep() {
  const now = Date.now();
  for (const [key, entry] of store) {
    const stillLocked = entry.lockedUntil && now < entry.lockedUntil;
    const recentAttempts = entry.attempts.some((t) => now - t < WINDOW_MS);
    if (!stillLocked && !recentAttempts) store.delete(key);
  }
}

// unref() so this periodic cleanup never keeps the process alive on its
// own — matters for tests, harmless in production.
setInterval(sweep, SWEEP_INTERVAL_MS).unref();

module.exports = { isLocked, recordFailure, recordSuccess, MAX_ATTEMPTS, WINDOW_MS, LOCKOUT_MS };
