'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { Router, sendJson } = require('./src/router');
const bookRoutes = require('./src/routes/books');
const customerRoutes = require('./src/routes/customers');
const transactionRoutes = require('./src/routes/transactions');
const authRoutes = require('./src/routes/login');
const branchRoutes = require('./src/routes/branches');
const reminderRoutes = require('./src/routes/reminders');
const staffRoutes = require('./src/routes/accounts');
const Reminder = require('./src/models/Reminder');
const { isValidSession, parseCookies } = require('./src/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const router = new Router();
authRoutes.register(router);
bookRoutes.register(router);
customerRoutes.register(router);
transactionRoutes.register(router);
branchRoutes.register(router);
reminderRoutes.register(router);
staffRoutes.register(router);

// Every /api/* route requires a valid session except login itself.
// Static files (including index.html) stay public — the frontend shows
// a login screen and only starts calling protected endpoints once signed in.
const PUBLIC_API_PATHS = new Set(['/api/login']);

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  const resolved = path.join(PUBLIC_DIR, filePath);

  // Prevent path traversal outside the public directory.
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  req.cookies = parseCookies(req);

  if (pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(pathname)) {
    if (!isValidSession(req.cookies.session)) {
      return sendJson(res, 401, { error: 'Please sign in.' });
    }
  }

  const handled = await router.handle(req, res, pathname);
  if (handled) return;

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Library Management System running at http://localhost:${PORT}`);
});

// Check for due/overdue books once a day automatically (and once shortly
// after startup, in case the server was down when today's check would have
// run). This only matters while the process stays running — see the README
// for a cron-based alternative if you'd rather not keep it up 24/7.
const DAY_MS = 24 * 60 * 60 * 1000;
function runReminderCheck() {
  Reminder.sendDueReminders()
    .then((summary) => {
      if (summary.checked > 0) {
        console.log(`[reminder] checked ${summary.checked}, sent ${summary.sent}, skipped ${summary.skipped} (already sent today)`);
      }
    })
    .catch((err) => console.error('[reminder] check failed:', err.message));
}
setTimeout(runReminderCheck, 10_000); // give the server a moment to finish starting up
setInterval(runReminderCheck, DAY_MS);