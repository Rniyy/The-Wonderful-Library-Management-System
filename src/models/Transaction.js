'use strict';

const { Store } = require('../data/store');
const Book = require('./Book');
const Customer = require('./Customer');

const store = new Store('transactions.json');
const LOAN_DAYS = 14;

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
    Book.setIssued(bookId, false);
    return this._record(bookId, customerId, 'RETURN', { wasOverdue });
  },
};

module.exports = Transaction;