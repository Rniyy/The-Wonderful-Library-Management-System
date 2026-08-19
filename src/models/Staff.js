'use strict';

const crypto = require('crypto');
const db = require('../data/db');

const stmts = {
  selectAll: db.prepare('SELECT id, username, created_at FROM staff ORDER BY id'),
  selectByUsername: db.prepare('SELECT * FROM staff WHERE username = ?'),
  selectById: db.prepare('SELECT id, username, created_at FROM staff WHERE id = ?'),
  insert: db.prepare('INSERT INTO staff (username, password_hash, created_at) VALUES (?, ?, ?)'),
  updateUsername: db.prepare('UPDATE staff SET username = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM staff WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM staff'),
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function rowToStaff(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

const Staff = {
  getAll() {
    return stmts.selectAll.all().map(rowToStaff);
  },

  getById(id) {
    return rowToStaff(stmts.selectById.get(id));
  },

  /** Creates a staff account. Throws a {status, message} error on failure. */
  create({ username, password }) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) throw { status: 400, message: 'Username is required.' };
    if (!password || String(password).length < 4) {
      throw { status: 400, message: 'Password must be at least 4 characters.' };
    }
    if (stmts.selectByUsername.get(cleanUsername)) {
      throw { status: 409, message: 'That username is already taken.' };
    }
    const info = stmts.insert.run(cleanUsername, hashPassword(password), new Date().toISOString());
    return this.getById(info.lastInsertRowid);
  },

  /** Updates a staff account's username and/or password. Either field is optional —
   *  pass only what should change. Throws a {status, message} error on failure. */
  update(id, { username, password }) {
    const staff = this.getById(id);
    if (!staff) throw { status: 404, message: 'Staff account not found.' };

    if (username !== undefined) {
      const cleanUsername = String(username).trim();
      if (!cleanUsername) throw { status: 400, message: 'Username is required.' };
      const existing = stmts.selectByUsername.get(cleanUsername);
      if (existing && existing.id !== id) {
        throw { status: 409, message: 'That username is already taken.' };
      }
      stmts.updateUsername.run(cleanUsername, id);
    }

    if (password !== undefined) {
      if (!password || String(password).length < 4) {
        throw { status: 400, message: 'Password must be at least 4 characters.' };
      }
      stmts.updatePassword.run(hashPassword(password), id);
    }

    return this.getById(id);
  },

  /** Removes a staff account. Throws a {status, message} error on failure. */
  remove(id) {
    if (stmts.count.get().n <= 1) {
      throw { status: 409, message: "Can't remove the last staff account." };
    }
    const info = stmts.remove.run(id);
    if (info.changes === 0) throw { status: 404, message: 'Staff account not found.' };
    return true;
  },

  /** Checks a username/password pair. Returns { id, username } on success, null on failure. */
  verifyCredentials(username, password) {
    const row = stmts.selectByUsername.get(String(username || '').trim());
    if (!row) return null;
    if (!verifyPassword(String(password || ''), row.password_hash)) return null;
    return { id: row.id, username: row.username };
  },
};

// Bootstrap: create a default account if none exist yet, so the app still
// works out of the box on a fresh install.
if (stmts.count.get().n === 0) {
  const username = process.env.STAFF_USERNAME || 'admin';
  const password = process.env.STAFF_PASSWORD || 'library';
  Staff.create({ username, password });
  if (!process.env.STAFF_PASSWORD) {
    console.warn(
      `Warning: created a default staff account "${username}" with password "library". ` +
      'Set STAFF_USERNAME/STAFF_PASSWORD in your environment before deploying this anywhere real, ' +
      'or add more accounts and remove this one from the Staff tab once you\'re signed in.'
    );
  } else {
    console.log(`Created default staff account "${username}".`);
  }
}

module.exports = Staff;