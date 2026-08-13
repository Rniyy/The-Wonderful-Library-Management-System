'use strict';

const { Store } = require('../data/store');
const Book = require('./Book');
const Customer = require('./Customer');

const store = new Store('transactions.json');
const LOAN_DAYS = 14;
const FINE_RATE = 0.25; // per day overdue

function daysLate(book) {
  if (!book.dueDate) return 0;
  const ms = Date.now() - new Date(book.dueDate).getTime();
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

  /** Issues a book to a customer. Throws a {status, message} error on failure. */
  issue(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };
    if (book.isIssued) throw { status: 409, message: `Book "${book.title}" is already issued.` };

    const customer = Customer.getById(customerId);
    if (!customer) throw { status: 404, message: `Customer ${customerId} not found.` };

    const dueDate = new Date(Date.now() + LOAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    Book.setIssued(bookId, true, dueDate);
    return this._record(bookId, customerId, 'ISSUE', { dueDate });
  },

  /** Returns a book. Throws a {status, message} error on failure. */
  return_(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };
    if (!book.isIssued) throw { status: 409, message: `Book "${book.title}" was not issued.` };

    const wasOverdue = Book.isOverdue(book);
    const lateDays = wasOverdue ? daysLate(book) : 0;
    const fineAmount = Math.round(lateDays * FINE_RATE * 100) / 100;

    Book.setIssued(bookId, false);
    return this._record(bookId, customerId, 'RETURN', { wasOverdue, lateDays, fineAmount });
  },

  /** Renews a currently-issued book, pushing its due date out another loan period.
   *  Throws a {status, message} error on failure. */
  renew(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };
    if (!book.isIssued) throw { status: 409, message: `Book "${book.title}" is not currently issued.` };

    const base = Book.isOverdue(book) ? Date.now() : new Date(book.dueDate).getTime();
    const dueDate = new Date(base + LOAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    Book.update(bookId, { dueDate });
    return this._record(bookId, customerId, 'RENEW', { dueDate });
  },

  /** Total unpaid fines outstanding right now, across all currently-overdue books. */
  outstandingFines() {
    return Book.getAll().reduce((sum, book) => {
      if (!Book.isOverdue(book)) return sum;
      return sum + Math.round(daysLate(book) * FINE_RATE * 100) / 100;
    }, 0);
  },
};

module.exports = Transaction;