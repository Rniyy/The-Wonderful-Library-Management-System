'use strict';

const crypto = require('crypto');

// Staff password. Set STAFF_PASSWORD in your environment for real use —
// this default is only here so the app runs out of the box.
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'library';
if (!process.env.STAFF_PASSWORD) {
  console.warn(
    'Warning: using the default staff password ("library"). ' +
    'Set STAFF_PASSWORD in your environment before deploying this anywhere real.'
  );
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map(); // token -> expiresAt

function checkPassword(password) {
  return typeof password === 'string' && password === STAFF_PASSWORD;
}

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
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

module.exports = { checkPassword, createSession, isValidSession, destroySession, parseCookies };
