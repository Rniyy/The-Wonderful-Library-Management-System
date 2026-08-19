'use strict';

const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map(); // token -> { staffId, expiresAt }

function createSession(staffId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { staffId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function isValidSession(token) {
  return Boolean(getSessionStaffId(token));
}

/** Returns the staff id for a valid session token, or null if missing/expired. */
function getSessionStaffId(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.staffId;
}

function destroySession(token) {
  sessions.delete(token);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

module.exports = { createSession, isValidSession, getSessionStaffId, destroySession, parseCookies };