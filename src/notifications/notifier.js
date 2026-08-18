'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const LOG_PATH = path.join(__dirname, '..', '..', 'data', 'reminders.log');
const WEBHOOK_URL = process.env.REMINDER_WEBHOOK_URL || '';

/**
 * Sends one reminder. Returns a promise that resolves once the attempt is
 * complete (never rejects — a failed send is logged, not thrown, so one bad
 * notification doesn't stop the rest of the batch).
 *
 * Without configuration, this just logs to data/reminders.log and the
 * console — useful for trying the feature out, but it doesn't actually
 * reach anyone. To really send email or SMS, set REMINDER_WEBHOOK_URL to a
 * URL that will forward the JSON payload on to a real provider — e.g. a
 * Zapier/Make/n8n webhook, or a small serverless function you write that
 * calls your email API (SendGrid, Postmark, Twilio, etc.) with the payload.
 */
function sendReminder(reminder) {
  const line = JSON.stringify({ ...reminder, sentAt: new Date().toISOString() });

  appendLog(line);
  console.log(`[reminder] ${reminder.kind} \u2014 "${reminder.bookTitle}" \u2192 ${reminder.customerName} (${reminder.customerEmail || 'no email on file'})`);

  if (!WEBHOOK_URL) return Promise.resolve({ delivered: false, reason: 'no REMINDER_WEBHOOK_URL configured' });
  return postToWebhook(reminder).catch((err) => {
    console.error('[reminder] webhook delivery failed:', err.message);
    return { delivered: false, reason: err.message };
  });
}

function appendLog(line) {
  try {
    fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
  } catch (err) {
    console.error('[reminder] failed to write log:', err.message);
  }
}

function postToWebhook(reminder) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(WEBHOOK_URL);
    } catch {
      return reject(new Error('REMINDER_WEBHOOK_URL is not a valid URL'));
    }
    const transport = target.protocol === 'http:' ? http : https;
    const body = JSON.stringify(reminder);

    const req = transport.request(
      target,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        res.on('data', () => {}); // drain
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ delivered: true });
          } else {
            reject(new Error(`webhook responded with ${res.statusCode}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendReminder, isConfigured: () => Boolean(WEBHOOK_URL) };
