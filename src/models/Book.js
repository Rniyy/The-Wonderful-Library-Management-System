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

  setIssued(id, isIssued) {
    return this.update(id, { isIssued });
  },
};

module.exports = Book;