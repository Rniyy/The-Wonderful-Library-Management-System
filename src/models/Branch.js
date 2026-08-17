'use strict';

const db = require('../data/db');

const stmts = {
  selectAll: db.prepare('SELECT * FROM branches ORDER BY id'),
  selectById: db.prepare('SELECT * FROM branches WHERE id = ?'),
  insert: db.prepare('INSERT INTO branches (name, address) VALUES (?, ?)'),
  update: db.prepare('UPDATE branches SET name = ?, address = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM branches WHERE id = ?'),
  countCopies: db.prepare('SELECT COUNT(*) AS n FROM copies WHERE branch_id = ?'),
};

function rowToBranch(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, address: row.address };
}

const Branch = {
  getAll() {
    return stmts.selectAll.all().map(rowToBranch);
  },

  getById(id) {
    return rowToBranch(stmts.selectById.get(id));
  },

  create({ name, address }) {
    const info = stmts.insert.run(String(name).trim(), address ? String(address).trim() : null);
    return this.getById(info.lastInsertRowid);
  },

  update(id, changes) {
    const branch = this.getById(id);
    if (!branch) return null;
    const name = changes.name !== undefined ? changes.name : branch.name;
    const address = changes.address !== undefined ? changes.address : branch.address;
    stmts.update.run(name, address, id);
    return this.getById(id);
  },

  /** Removes a branch. Throws a {status, message} error on failure. */
  remove(id) {
    const branch = this.getById(id);
    if (!branch) throw { status: 404, message: `Branch ${id} not found.` };
    const { n } = stmts.countCopies.get(id);
    if (n > 0) {
      throw { status: 409, message: `Can't remove "${branch.name}" while it still holds ${n} cop${n === 1 ? 'y' : 'ies'}.` };
    }
    stmts.remove.run(id);
    return true;
  },
};

module.exports = Branch;
