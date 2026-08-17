'use strict';

const Book = require('../models/Book');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/books', (req, res) => {
    sendJson(res, 200, Book.getAll().map((b) => Book.withStats(b)));
  });

  router.get('/api/books/:id', (req, res) => {
    const book = Book.getById(Number(req.params.id));
    if (!book) return sendJson(res, 404, { error: 'Book not found.' });
    sendJson(res, 200, Book.withStats(book));
  });

  router.post('/api/books', (req, res) => {
    const { title, author, cover, copies, branchId } = req.body;
    if (!title || !String(title).trim()) {
      return sendJson(res, 400, { error: 'Title is required.' });
    }
    const book = Book.create({ title, author, cover, copies, branchId });
    sendJson(res, 201, Book.withStats(book));
  });

  router.post('/api/books/:id/copies', (req, res) => {
    const { branchId, count } = req.body;
    if (!branchId) return sendJson(res, 400, { error: 'branchId is required.' });
    const book = Book.addCopies(Number(req.params.id), Number(branchId), Number(count) || 1);
    sendJson(res, 201, Book.withStats(book));
  });

  router.put('/api/books/:id', (req, res) => {
    const book = Book.update(Number(req.params.id), req.body);
    if (!book) return sendJson(res, 404, { error: 'Book not found.' });
    sendJson(res, 200, Book.withStats(book));
  });

  router.delete('/api/books/:id', (req, res) => {
    Book.remove(Number(req.params.id));
    sendJson(res, 200, { removed: true });
  });

  router.post('/api/books/:id/holds', (req, res) => {
    const { customerId } = req.body;
    if (!customerId) return sendJson(res, 400, { error: 'customerId is required.' });
    const book = Book.addHold(Number(req.params.id), Number(customerId));
    sendJson(res, 201, Book.withStats(book));
  });

  router.delete('/api/books/:id/holds/:customerId', (req, res) => {
    const book = Book.removeHold(Number(req.params.id), Number(req.params.customerId));
    sendJson(res, 200, Book.withStats(book));
  });
}

module.exports = { register };