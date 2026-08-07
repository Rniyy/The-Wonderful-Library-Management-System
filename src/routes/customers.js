'use strict';

const Customer = require('../models/Customer');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/customers', (req, res) => {
    sendJson(res, 200, Customer.getAll());
  });

  router.get('/api/customers/:id', (req, res) => {
    const customer = Customer.getById(Number(req.params.id));
    if (!customer) return sendJson(res, 404, { error: 'Customer not found.' });
    sendJson(res, 200, customer);
  });

  router.post('/api/customers', (req, res) => {
    const { name, email } = req.body;
    if (!name || !String(name).trim()) {
      return sendJson(res, 400, { error: 'Name is required.' });
    }
    const customer = Customer.create({ name, email });
    sendJson(res, 201, customer);
  });

  router.put('/api/customers/:id', (req, res) => {
    const customer = Customer.update(Number(req.params.id), req.body);
    if (!customer) return sendJson(res, 404, { error: 'Customer not found.' });
    sendJson(res, 200, customer);
  });

  router.delete('/api/customers/:id', (req, res) => {
    const removed = Customer.remove(Number(req.params.id));
    if (!removed) return sendJson(res, 404, { error: 'Customer not found.' });
    sendJson(res, 200, { removed: true });
  });
}

module.exports = { register };
