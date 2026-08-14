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

  create({ title, author, cover, copies }) {
    const books = store.all();
    const copyCount = Math.min(Math.max(Number(copies) || 1, 1), 999);
    const book = {
      id: store.nextId(books),
      title: String(title).trim(),
      author: String(author || 'Unknown').trim(),
      cover: cover ? String(cover) : null,
      holds: [], // queue of customer ids waiting for this title
      copies: Array.from({ length: copyCount }, (_, i) => ({
        copyId: i + 1,
        isIssued: false,
        dueDate: null,
        customerId: null,
      })),
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

  /** Removes a book. Throws a {status, message} error on failure. */
  remove(id) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    if (book.copies.some((c) => c.isIssued)) {
      throw { status: 409, message: `Can't withdraw "${book.title}" while a copy is still checked out.` };
    }
    const books = store.all().filter((b) => b.id !== id);
    store.save(books);
    return true;
  },

  isCopyOverdue(copy) {
    return Boolean(copy.isIssued && copy.dueDate && new Date(copy.dueDate) < new Date());
  },

  availableCount(book) {
    return book.copies.filter((c) => !c.isIssued).length;
  },

  /** Attaches computed fields (counts, soonest due date) for API responses. Doesn't mutate storage. */
  withStats(book) {
    const total = book.copies.length;
    const available = this.availableCount(book);
    const issuedCopies = book.copies.filter((c) => c.isIssued);
    const nextDueDate = issuedCopies.length
      ? issuedCopies.reduce((min, c) => (!min || c.dueDate < min ? c.dueDate : min), null)
      : null;
    const anyOverdue = issuedCopies.some((c) => this.isCopyOverdue(c));
    return { ...book, totalCopies: total, availableCopies: available, nextDueDate, anyOverdue };
  },

  /** Marks the first available copy as issued. Throws a {status, message} error on failure. */
  issueCopy(id, customerId, dueDate) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const copy = book.copies.find((c) => !c.isIssued);
    if (!copy) throw { status: 409, message: `No copies of "${book.title}" are available.` };
    copy.isIssued = true;
    copy.dueDate = dueDate;
    copy.customerId = customerId;
    this.update(id, { copies: book.copies });
    return book;
  },

  /** Finds and clears the copy issued to a given customer. Throws a {status, message} error if none found. */
  returnCopy(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const copy = book.copies.find((c) => c.isIssued && c.customerId === customerId);
    if (!copy) {
      throw { status: 409, message: `That member doesn't have a copy of "${book.title}" checked out.` };
    }
    const priorDueDate = copy.dueDate;
    copy.isIssued = false;
    copy.dueDate = null;
    copy.customerId = null;
    this.update(id, { copies: book.copies });
    return { book, priorDueDate };
  },

  /** Extends the due date on the copy issued to a given customer. Throws a {status, message} error if none found. */
  renewCopy(id, customerId, newDueDate) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const copy = book.copies.find((c) => c.isIssued && c.customerId === customerId);
    if (!copy) {
      throw { status: 409, message: `That member doesn't have a copy of "${book.title}" checked out.` };
    }
    copy.dueDate = newDueDate;
    this.update(id, { copies: book.copies });
    return book;
  },

  /** Adds a customer to a book's hold queue. Throws a {status, message} error on failure. */
  addHold(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    if (this.availableCount(book) > 0) {
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