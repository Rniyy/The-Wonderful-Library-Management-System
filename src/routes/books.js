'use strict';

const Book = require('../models/Book');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/books', (req, res) => {
    sendJson(res, 200, Book.getAll());
  });

  router.get('/api/books/:id', (req, res) => {
    const book = Book.getById(Number(req.params.id));
    if (!book) return sendJson(res, 404, { error: 'Book not found.' });
    sendJson(res, 200, book);
  });

  router.post('/api/books', (req, res) => {
    const { title, author, cover } = req.body;
    if (!title || !String(title).trim()) {
      return sendJson(res, 400, { error: 'Title is required.' });
    }
    const book = Book.create({ title, author, cover });
    sendJson(res, 201, book);
  });

  router.put('/api/books/:id', (req, res) => {
    const book = Book.update(Number(req.params.id), req.body);
    if (!book) return sendJson(res, 404, { error: 'Book not found.' });
    sendJson(res, 200, book);
  });

  router.delete('/api/books/:id', (req, res) => {
    const removed = Book.remove(Number(req.params.id));
    if (!removed) return sendJson(res, 404, { error: 'Book not found.' });
    sendJson(res, 200, { removed: true });
  });
}

module.exports = { register };