'use strict';

const { Store } = require('../data/store');
const store = new Store('customers.json');

const Customer = {
  getAll() {
    return store.all();
  },

  getById(id) {
    return store.all().find((c) => c.id === id) || null;
  },

  create({ name, email }) {
    const customers = store.all();
    const customer = {
      id: store.nextId(customers),
      name: String(name).trim(),
      email: email ? String(email).trim() : '',
    };
    customers.push(customer);
    store.save(customers);
    return customer;
  },

  update(id, changes) {
    const customers = store.all();
    const idx = customers.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    customers[idx] = { ...customers[idx], ...changes, id };
    store.save(customers);
    return customers[idx];
  },

  remove(id) {
    const customers = store.all();
    const next = customers.filter((c) => c.id !== id);
    const removed = next.length !== customers.length;
    if (removed) store.save(next);
    return removed;
  },
};

module.exports = Customer;
