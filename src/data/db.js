'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = process.env.LIBRARY_DB_PATH || path.join(DATA_DIR, 'library.db');
const IS_MEMORY = DB_PATH === ':memory:';

if (!IS_MEMORY && !fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbAlreadyExisted = !IS_MEMORY && fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    cover TEXT
  );

  CREATE TABLE IF NOT EXISTS copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    copy_number INTEGER NOT NULL,
    is_issued INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    customer_id INTEGER,
    branch_id INTEGER REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS holds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER,
    customer_id INTEGER,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    due_date TEXT,
    was_overdue INTEGER,
    late_days INTEGER,
    fine_amount REAL
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reminders_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    sent_date TEXT NOT NULL,
    sent_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_copies_book ON copies(book_id);
  CREATE INDEX IF NOT EXISTS idx_holds_book ON holds(book_id, position);
  CREATE INDEX IF NOT EXISTS idx_transactions_book ON transactions(book_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_dedup ON reminders_sent(book_id, customer_id, kind, sent_date);
`);

// Defensive migration for databases created by an earlier version of this
// app (before branches existed) — add the column if it isn't there yet.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}
ensureColumn('copies', 'branch_id', 'branch_id INTEGER REFERENCES branches(id)');
ensureColumn('staff', 'role', "role TEXT NOT NULL DEFAULT 'staff'");

// If no admin exists at all (a fresh table default, or every admin account
// somehow got removed), promote the earliest account so nobody's locked
// out of staff management. Only fires when there are zero admins — doesn't
// undo a deliberate demotion as long as at least one admin remains.
const adminCount = db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'admin'").get().n;
if (adminCount === 0) {
  db.exec(`UPDATE staff SET role = 'admin' WHERE id = (SELECT MIN(id) FROM staff)`);
}

// Every install needs at least one branch to assign copies to.
function ensureDefaultBranch() {
  const existing = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO branches (name, address) VALUES (?, ?)').run('Main Branch', null);
  return info.lastInsertRowid;
}
const DEFAULT_BRANCH_ID = ensureDefaultBranch();

// Any copy left without a branch (pre-existing data, or JSON migration below) goes to the default branch.
db.prepare('UPDATE copies SET branch_id = ? WHERE branch_id IS NULL').run(DEFAULT_BRANCH_ID);

// One-time migration: if this is a fresh database but the old JSON store has
// data, import it so nobody loses their catalog by upgrading. Skipped for
// in-memory test databases — tests shouldn't pick up real data/*.json files.
if (!dbAlreadyExisted && !IS_MEMORY) {
  migrateFromJsonIfPresent();
}

function migrateFromJsonIfPresent() {
  const booksPath = path.join(DATA_DIR, 'books.json');
  const customersPath = path.join(DATA_DIR, 'customers.json');
  const transactionsPath = path.join(DATA_DIR, 'transactions.json');
  if (!fs.existsSync(booksPath) && !fs.existsSync(customersPath) && !fs.existsSync(transactionsPath)) {
    return;
  }

  console.log('Migrating existing JSON data into SQLite...');
  const readJson = (p) => {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return [];
    }
  };

  const oldBooks = fs.existsSync(booksPath) ? readJson(booksPath) : [];
  const oldCustomers = fs.existsSync(customersPath) ? readJson(customersPath) : [];
  const oldTransactions = fs.existsSync(transactionsPath) ? readJson(transactionsPath) : [];

  const insertBook = db.prepare('INSERT INTO books (id, title, author, cover) VALUES (?, ?, ?, ?)');
  const insertCopy = db.prepare(
    'INSERT INTO copies (book_id, copy_number, is_issued, due_date, customer_id, branch_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertHold = db.prepare('INSERT INTO holds (book_id, customer_id, position) VALUES (?, ?, ?)');
  const insertCustomer = db.prepare('INSERT INTO customers (id, name, email) VALUES (?, ?, ?)');
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, book_id, customer_id, type, timestamp, due_date, was_overdue, late_days, fine_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const b of oldBooks) {
      insertBook.run(b.id, b.title, b.author || null, b.cover || null);
      const copies = Array.isArray(b.copies) && b.copies.length > 0
        ? b.copies
        : [{ copyId: 1, isIssued: !!b.isIssued, dueDate: b.dueDate || null, customerId: null }];
      for (const c of copies) {
        insertCopy.run(b.id, c.copyId, c.isIssued ? 1 : 0, c.dueDate || null, c.customerId ?? null, DEFAULT_BRANCH_ID);
      }
      (b.holds || []).forEach((customerId, idx) => {
        insertHold.run(b.id, customerId, idx);
      });
    }
    for (const c of oldCustomers) {
      insertCustomer.run(c.id, c.name, c.email || null);
    }
    for (const t of oldTransactions) {
      insertTransaction.run(
        t.id,
        t.bookId,
        t.customerId,
        t.type,
        t.timestamp,
        t.dueDate || null,
        t.wasOverdue ? 1 : t.wasOverdue === false ? 0 : null,
        t.lateDays ?? null,
        t.fineAmount ?? null
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Keep the old files around as a safety net but get them out of the way.
  for (const p of [booksPath, customersPath, transactionsPath]) {
    if (fs.existsSync(p)) fs.renameSync(p, `${p}.migrated`);
  }
  console.log('Migration complete \u2014 old JSON files renamed to *.migrated.');
}

module.exports = db;
module.exports.DEFAULT_BRANCH_ID = DEFAULT_BRANCH_ID;