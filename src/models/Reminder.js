'use strict';

const db = require('../data/db');
const Book = require('./Book');
const Customer = require('./Customer');
const { sendReminder } = require('../notifications/notifier');

const DUE_SOON_DAYS = 2; // send a "due soon" reminder this many days out

const stmts = {
  tryRecord: db.prepare(`
    INSERT OR IGNORE INTO reminders_sent (book_id, customer_id, kind, sent_date, sent_at)
    VALUES (?, ?, ?, ?, ?)
  `),
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Scans every issued copy and classifies it as due-soon, overdue, or neither. */
function findCandidates() {
  const now = Date.now();
  const soonCutoff = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
  const candidates = [];

  for (const book of Book.getAll()) {
    for (const copy of book.copies) {
      if (!copy.isIssued || !copy.dueDate) continue;
      const dueMs = new Date(copy.dueDate).getTime();
      let kind = null;
      if (dueMs < now) kind = 'overdue';
      else if (dueMs <= soonCutoff) kind = 'due_soon';
      if (!kind) continue;

      const customer = Customer.getById(copy.customerId);
      candidates.push({
        bookId: book.id,
        bookTitle: book.title,
        customerId: copy.customerId,
        customerName: customer ? customer.name : `Member ${copy.customerId}`,
        customerEmail: customer ? customer.email : '',
        dueDate: copy.dueDate,
        kind,
      });
    }
  }
  return candidates;
}

const Reminder = {
  /** Preview what would be sent right now, without actually sending or recording anything. */
  findDue() {
    return findCandidates();
  },

  /** Sends (and dedupes) reminders for everything currently due-soon or overdue.
   *  Returns a summary of what happened. */
  async sendDueReminders() {
    const candidates = findCandidates();
    const date = todayKey();
    let sent = 0;
    let skipped = 0;

    for (const c of candidates) {
      const info = stmts.tryRecord.run(c.bookId, c.customerId, c.kind, date, new Date().toISOString());
      if (info.changes === 0) {
        skipped++; // already sent today for this book+customer+kind
        continue;
      }
      await sendReminder(c);
      sent++;
    }

    return { checked: candidates.length, sent, skipped };
  },
};

module.exports = Reminder;
