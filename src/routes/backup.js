'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = require('../data/db');
const Staff = require('../models/Staff');
const { getSessionStaffId } = require('../auth');
const { sendJson } = require('../router');

function requireAdmin(req, res) {
  const currentId = getSessionStaffId(req.cookies?.session);
  if (!Staff.isAdmin(currentId)) {
    sendJson(res, 403, { error: 'Only an admin can do that.' });
    return false;
  }
  return true;
}

function register(router) {
  router.get('/api/backup', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (db.IS_MEMORY) {
      return sendJson(res, 400, { error: 'No persistent database to back up in this environment.' });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tmpPath = path.join(os.tmpdir(), `library-backup-${stamp}-${process.pid}.db`);

    try {
      // VACUUM INTO produces a clean, consistent snapshot even from a live
      // connection — safer than copying the raw file, which could catch a
      // write mid-flight.
      db.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
      const data = fs.readFileSync(tmpPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="library-backup-${stamp}.db"`,
        'Content-Length': data.length,
      });
      res.end(data);
    } catch (err) {
      sendJson(res, 500, { error: `Backup failed: ${err.message}` });
    } finally {
      fs.unlink(tmpPath, () => {}); // best-effort cleanup, ignore errors
    }
  });

  router.post('/api/backup/restore', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (db.IS_MEMORY) {
      sendJson(res, 400, { error: 'Cannot restore over an in-memory database.' });
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const chunks = [];
      let tooLarge = false;
      const MAX_BYTES = 200 * 1024 * 1024; // 200MB safety cap

      req.on('data', (chunk) => {
        if (tooLarge) return;
        chunks.push(chunk);
        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        if (total > MAX_BYTES) {
          tooLarge = true;
          sendJson(res, 413, { error: 'Backup file is too large.' });
          resolve();
        }
      });

      req.on('end', () => {
        if (tooLarge) return;
        try {
          const buffer = Buffer.concat(chunks);

          if (buffer.slice(0, 16).toString('utf8') !== 'SQLite format 3\0') {
            sendJson(res, 400, { error: "That doesn't look like a valid SQLite database file." });
            return resolve();
          }

          const stagingPath = `${db.DB_PATH}.restore-staging`;
          fs.writeFileSync(stagingPath, buffer);

          // Sanity-check the upload before committing to it: open it and
          // confirm it has the shape of an actual library database.
          try {
            const check = new DatabaseSync(stagingPath);
            const hasBooksTable = check.prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='books'"
            ).get();
            const integrity = check.prepare('PRAGMA integrity_check').get();
            check.close();
            if (!hasBooksTable) {
              fs.unlinkSync(stagingPath);
              sendJson(res, 400, { error: "That file doesn't look like a library database (no books table)." });
              return resolve();
            }
            if (integrity.integrity_check !== 'ok') {
              fs.unlinkSync(stagingPath);
              sendJson(res, 400, { error: 'That database file failed an integrity check.' });
              return resolve();
            }
          } catch (err) {
            fs.unlinkSync(stagingPath);
            sendJson(res, 400, { error: `Could not read that file as a SQLite database: ${err.message}` });
            return resolve();
          }

          // Keep a safety copy of what was live, then swap the upload into place.
          const safetyPath = path.join(db.DATA_DIR, `library.db.pre-restore-${Date.now()}`);
          fs.copyFileSync(db.DB_PATH, safetyPath);
          fs.renameSync(stagingPath, db.DB_PATH);

          sendJson(res, 200, {
            ok: true,
            message: 'Restored. Restart the server for this to take effect.',
          });
        } catch (err) {
          sendJson(res, 500, { error: `Restore failed: ${err.message}` });
        }
        resolve();
      });

      req.on('error', (err) => {
        sendJson(res, 500, { error: `Upload failed: ${err.message}` });
        resolve();
      });
    });
  });
}

module.exports = { register };
