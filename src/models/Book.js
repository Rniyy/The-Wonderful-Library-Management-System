'use strict';

const { Store } = require('../data/store');
const store = new Store('books.json');

const Book = {
  getAll() {
    return store.all();
  },

  getById(id) {
    return store.all().find((b) => b.id === id) || null;
  },

  create({ title, author, cover }) {
    const books = store.all();
    const book = {
      id: store.nextId(books),
      title: String(title).trim(),
      author: String(author || 'Unknown').trim(),
      cover: cover ? String(cover) : null,
      isIssued: false,
      dueDate: null,
      holds: [], // queue of customer ids waiting for this book
    };
    books.push(book);
    store.save(books);
    return book;
  },

  update(id, changes) {
    const books = store.all();
    const idx = books.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    books[idx] = { ...books[idx], ...changes, id };
    store.save(books);
    return books[idx];
  },

  remove(id) {
    const books = store.all();
    const next = books.filter((b) => b.id !== id);
    const removed = next.length !== books.length;
    if (removed) store.save(next);
    return removed;
  },

  setIssued(id, isIssued, dueDate = null) {
    return this.update(id, { isIssued, dueDate: isIssued ? dueDate : null });
  },

  isOverdue(book) {
    return Boolean(book.isIssued && book.dueDate && new Date(book.dueDate) < new Date());
  },

  /** Adds a customer to a book's hold queue. Throws a {status, message} error on failure. */
  addHold(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    if (!book.isIssued) {
      throw { status: 409, message: `"${book.title}" is available right now \u2014 no need to hold it.` };
    }
    const holds = book.holds || [];
    if (holds.includes(customerId)) {
      throw { status: 409, message: 'That member is already in the hold queue for this book.' };
    }
    return this.update(id, { holds: [...holds, customerId] });
  },

  /** Removes a customer from a book's hold queue. Throws a {status, message} error on failure. */
  removeHold(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const holds = (book.holds || []).filter((c) => c !== customerId);
    return this.update(id, { holds });
  },

  /** Removes and returns the first customer in the hold queue (called on issue). */
  shiftHold(id) {
    const book = this.getById(id);
    if (!book || !book.holds || book.holds.length === 0) return null;
    const [next, ...rest] = book.holds;
    this.update(id, { holds: rest });
    return next;
  },
};

module.exports = Book;