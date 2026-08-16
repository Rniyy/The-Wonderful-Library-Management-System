'use strict';

const db = require('../data/db');
const Book = require('./Book');
const Customer = require('./Customer');

const LOAN_DAYS = 14;
const FINE_RATE = 0.25; // per day overdue

const stmts = {
  selectAll: db.prepare('SELECT * FROM transactions ORDER BY id DESC'),
  insert: db.prepare(`
    INSERT INTO transactions (book_id, customer_id, type, timestamp, due_date, was_overdue, late_days, fine_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  selectById: db.prepare('SELECT * FROM transactions WHERE id = ?'),
  countIssuesByBook: db.prepare(`
    SELECT book_id AS bookId, COUNT(*) AS count FROM transactions
    WHERE type = 'ISSUE' GROUP BY book_id ORDER BY count DESC LIMIT ?
  `),
  countIssuesByCustomer: db.prepare(`
    SELECT customer_id AS customerId, COUNT(*) AS count FROM transactions
    WHERE type = 'ISSUE' GROUP BY customer_id ORDER BY count DESC LIMIT ?
  `),
};

function daysLate(dueDate) {
  if (!dueDate) return 0;
  const ms = Date.now() - new Date(dueDate).getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function rowToTransaction(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    customerId: row.customer_id,
    type: row.type,
    timestamp: row.timestamp,
    ...(row.due_date !== null ? { dueDate: row.due_date } : {}),
    ...(row.was_overdue !== null ? { wasOverdue: Boolean(row.was_overdue) } : {}),
    ...(row.late_days !== null ? { lateDays: row.late_days } : {}),
    ...(row.fine_amount !== null ? { fineAmount: row.fine_amount } : {}),
  };
}

const Transaction = {
  getAll() {
    return stmts.selectAll.all().map(rowToTransaction);
  },

  _record(bookId, customerId, type, extra = {}) {
    const info = stmts.insert.run(
      bookId,
      customerId,
      type,
      new Date().toISOString(),
      extra.dueDate ?? null,
      extra.wasOverdue !== undefined ? (extra.wasOverdue ? 1 : 0) : null,
      extra.lateDays ?? null,
      extra.fineAmount ?? null
    );
    return rowToTransaction(stmts.selectById.get(info.lastInsertRowid));
  },

  /** Issues a copy of a book to a customer. Throws a {status, message} error on failure. */
  issue(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };

    const customer = Customer.getById(customerId);
    if (!customer) throw { status: 404, message: `Customer ${customerId} not found.` };

    if (Book.availableCount(book) === 0) {
      throw { status: 409, message: `No copies of "${book.title}" are available.` };
    }

    const holds = book.holds || [];
    if (holds.length > 0 && holds[0] !== customerId) {
      throw { status: 409, message: `This book is reserved for another member.` };
    }
    if (holds.length > 0 && holds[0] === customerId) {
      Book.shiftHold(bookId);
    }

    const dueDate = new Date(Date.now() + LOAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    Book.issueCopy(bookId, customerId, dueDate);
    return this._record(bookId, customerId, 'ISSUE', { dueDate });
  },

  /** Returns a copy of a book. Throws a {status, message} error on failure. */
  return_(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };

    const { priorDueDate } = Book.returnCopy(bookId, customerId);

    const wasOverdue = Boolean(priorDueDate && new Date(priorDueDate) < new Date());
    const lateDays = wasOverdue ? daysLate(priorDueDate) : 0;
    const fineAmount = Math.round(lateDays * FINE_RATE * 100) / 100;

    return this._record(bookId, customerId, 'RETURN', { wasOverdue, lateDays, fineAmount });
  },

  /** Renews the copy a customer currently has checked out, pushing its due date out
   *  another loan period. Throws a {status, message} error on failure. */
  renew(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };

    const copy = book.copies.find((c) => c.isIssued && c.customerId === customerId);
    if (!copy) {
      throw { status: 409, message: `That member doesn't have a copy of "${book.title}" checked out.` };
    }

    const base = Book.isCopyOverdue(copy) ? Date.now() : new Date(copy.dueDate).getTime();
    const dueDate = new Date(base + LOAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    Book.renewCopy(bookId, customerId, dueDate);
    return this._record(bookId, customerId, 'RENEW', { dueDate });
  },

  /** Total unpaid fines outstanding right now, across all currently-overdue copies. */
  outstandingFines() {
    return Book.getAll().reduce((sum, book) => {
      const overdueCopies = book.copies.filter((c) => Book.isCopyOverdue(c));
      const bookFines = overdueCopies.reduce(
        (s, c) => s + Math.round(daysLate(c.dueDate) * FINE_RATE * 100) / 100,
        0
      );
      return sum + bookFines;
    }, 0);
  },

  /** Top borrowed books and most active members, ranked by number of ISSUE events. */
  leaderboard(limit = 5) {
    const topBooks = stmts.countIssuesByBook.all(limit).map((row) => {
      const book = Book.getById(row.bookId);
      return { bookId: row.bookId, title: book ? book.title : `Book ${row.bookId}`, count: row.count };
    });

    const topMembers = stmts.countIssuesByCustomer.all(limit).map((row) => {
      const customer = Customer.getById(row.customerId);
      return {
        customerId: row.customerId,
        name: customer ? customer.name : `Member ${row.customerId}`,
        count: row.count,
      };
    });

    return { books: topBooks, members: topMembers };
  },
};

module.exports = Transaction;