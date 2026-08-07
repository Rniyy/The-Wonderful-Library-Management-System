'use strict';

const { Store } = require('../data/store');
const Book = require('./Book');
const Customer = require('./Customer');

const store = new Store('transactions.json');

const Transaction = {
  getAll() {
    return store.all().sort((a, b) => b.id - a.id); // newest first
  },

  count() {
    return store.all().length;
  },

  _record(bookId, customerId, type) {
    const transactions = store.all();
    const transaction = {
      id: store.nextId(transactions),
      bookId,
      customerId,
      type,
      timestamp: new Date().toISOString(),
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

    Book.setIssued(bookId, true);
    return this._record(bookId, customerId, 'ISSUE');
  },

  /** Returns a book. Throws a {status, message} error on failure. */
  return_(bookId, customerId) {
    const book = Book.getById(bookId);
    if (!book) throw { status: 404, message: `Book ${bookId} not found.` };
    if (!book.isIssued) throw { status: 409, message: `Book "${book.title}" was not issued.` };

    Book.setIssued(bookId, false);
    return this._record(bookId, customerId, 'RETURN');
  },
};

module.exports = Transaction;
