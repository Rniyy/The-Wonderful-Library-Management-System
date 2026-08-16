'use strict';

const db = require('../data/db');

const stmts = {
  selectAll: db.prepare('SELECT * FROM customers ORDER BY id'),
  selectById: db.prepare('SELECT * FROM customers WHERE id = ?'),
  insert: db.prepare('INSERT INTO customers (name, email) VALUES (?, ?)'),
  update: db.prepare('UPDATE customers SET name = ?, email = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM customers WHERE id = ?'),
};

const Customer = {
  getAll() {
    return stmts.selectAll.all();
  },

  getById(id) {
    return stmts.selectById.get(id) || null;
  },

  create({ name, email }) {
    const info = stmts.insert.run(String(name).trim(), email ? String(email).trim() : '');
    return this.getById(info.lastInsertRowid);
  },

  update(id, changes) {
    const customer = this.getById(id);
    if (!customer) return null;
    const name = changes.name !== undefined ? changes.name : customer.name;
    const email = changes.email !== undefined ? changes.email : customer.email;
    stmts.update.run(name, email, id);
    return this.getById(id);
  },

  remove(id) {
    const info = stmts.remove.run(id);
    return info.changes > 0;
  },
};

module.exports = Customer;