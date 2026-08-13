'use strict';

const Transaction = require('../models/Transaction');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/transactions', (req, res) => {
    sendJson(res, 200, Transaction.getAll());
  });

  router.post('/api/transactions/issue', (req, res) => {
    const { bookId, customerId } = req.body;
    if (!bookId || !customerId) {
      return sendJson(res, 400, { error: 'bookId and customerId are required.' });
    }
    const transaction = Transaction.issue(Number(bookId), Number(customerId));
    sendJson(res, 201, transaction);
  });

  router.post('/api/transactions/return', (req, res) => {
    const { bookId, customerId } = req.body;
    if (!bookId || !customerId) {
      return sendJson(res, 400, { error: 'bookId and customerId are required.' });
    }
    const transaction = Transaction.return_(Number(bookId), Number(customerId));
    sendJson(res, 201, transaction);
  });

  router.post('/api/transactions/renew', (req, res) => {
    const { bookId, customerId } = req.body;
    if (!bookId || !customerId) {
      return sendJson(res, 400, { error: 'bookId and customerId are required.' });
    }
    const transaction = Transaction.renew(Number(bookId), Number(customerId));
    sendJson(res, 201, transaction);
  });

  router.get('/api/transactions/fines', (req, res) => {
    sendJson(res, 200, { outstanding: Transaction.outstandingFines() });
  });
}

module.exports = { register };