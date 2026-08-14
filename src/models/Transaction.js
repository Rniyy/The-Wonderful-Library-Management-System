'use strict';

const { Store } = require('../data/store');
const Book = require('./Book');
const Customer = require('./Customer');

const store = new Store('transactions.json');
const LOAN_DAYS = 14;
const FINE_RATE = 0.25; // per day overdue

function daysLate(dueDate) {
  if (!dueDate) return 0;
  const ms = Date.now() - new Date(dueDate).getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

const Transaction = {
  getAll() {
    return store.all().sort((a, b) => b.id - a.id); // newest first
  },

  count() {
    return store.all().length;
  },

  _record(bookId, customerId, type, extra = {}) {
    const transactions = store.all();
    const transaction = {
      id: store.nextId(transactions),
      bookId,
      customerId,
      type,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    transactions.push(transaction);
    store.save(transactions);
    return transaction;
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
    const issues = store.all().filter((t) => t.type === 'ISSUE');

    const bookCounts = new Map();
    const customerCounts = new Map();
    for (const t of issues) {
      bookCounts.set(t.bookId, (bookCounts.get(t.bookId) || 0) + 1);
      customerCounts.set(t.customerId, (customerCounts.get(t.customerId) || 0) + 1);
    }

    const topBooks = [...bookCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([bookId, count]) => {
        const book = Book.getById(bookId);
        return { bookId, title: book ? book.title : `Book ${bookId}`, count };
      });

    const topMembers = [...customerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([customerId, count]) => {
        const customer = Customer.getById(customerId);
        return { customerId, name: customer ? customer.name : `Member ${customerId}`, count };
      });

    return { books: topBooks, members: topMembers };
  },
};

module.exports = Transaction;