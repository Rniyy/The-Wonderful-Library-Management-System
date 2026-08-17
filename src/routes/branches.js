'use strict';

const Branch = require('../models/Branch');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/branches', (req, res) => {
    sendJson(res, 200, Branch.getAll());
  });

  router.get('/api/branches/:id', (req, res) => {
    const branch = Branch.getById(Number(req.params.id));
    if (!branch) return sendJson(res, 404, { error: 'Branch not found.' });
    sendJson(res, 200, branch);
  });

  router.post('/api/branches', (req, res) => {
    const { name, address } = req.body;
    if (!name || !String(name).trim()) {
      return sendJson(res, 400, { error: 'Name is required.' });
    }
    const branch = Branch.create({ name, address });
    sendJson(res, 201, branch);
  });

  router.put('/api/branches/:id', (req, res) => {
    const branch = Branch.update(Number(req.params.id), req.body);
    if (!branch) return sendJson(res, 404, { error: 'Branch not found.' });
    sendJson(res, 200, branch);
  });

  router.delete('/api/branches/:id', (req, res) => {
    Branch.remove(Number(req.params.id));
    sendJson(res, 200, { removed: true });
  });
}

module.exports = { register };
