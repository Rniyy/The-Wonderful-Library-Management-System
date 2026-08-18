'use strict';

process.env.LIBRARY_DB_PATH = ':memory:';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertThrowsMessage } = require('./helpers');

const Book = require('../src/models/Book');
const Branch = require('../src/models/Branch');
const Customer = require('../src/models/Customer');
const Transaction = require('../src/models/Transaction');

test('a default branch exists on a fresh database', () => {
  const branches = Branch.getAll();
  assert.equal(branches.length, 1);
  assert.equal(branches[0].name, 'Main Branch');
});

test('create() adds a new branch', () => {
  const branch = Branch.create({ name: 'Downtown', address: '123 Main St' });
  assert.ok(branch.id);
  assert.equal(branch.name, 'Downtown');
});

test('remove() is blocked while the branch still holds copies', () => {
  const main = Branch.getAll()[0];
  Book.create({ title: 'Dune', copies: 1, branchId: main.id });
  assertThrowsMessage(() => Branch.remove(main.id), 'still holds');
});

test('remove() succeeds once the branch has no copies', () => {
  const branch = Branch.create({ name: 'Empty Branch' });
  assert.equal(Branch.remove(branch.id), true);
  assert.equal(Branch.getById(branch.id), null);
});

test('addCopies() adds copies at a specific branch without disturbing existing ones', () => {
  const main = Branch.getAll()[0];
  const downtown = Branch.create({ name: 'Downtown' });
  const book = Book.create({ title: 'Dune', copies: 2, branchId: main.id });

  const updated = Book.addCopies(book.id, downtown.id, 1);
  assert.equal(updated.copies.length, 3);
  assert.equal(updated.copies.filter((c) => c.branchId === main.id).length, 2);
  assert.equal(updated.copies.filter((c) => c.branchId === downtown.id).length, 1);
});

test('issuing only pulls from the requested branch, even if other branches have copies', () => {
  const main = Branch.getAll()[0];
  const downtown = Branch.create({ name: 'Downtown' });
  const book = Book.create({ title: 'Dune', copies: 1, branchId: main.id });
  Book.addCopies(book.id, downtown.id, 1);

  const ada = Customer.create({ name: 'Ada' });
  const grace = Customer.create({ name: 'Grace' });

  Transaction.issue(book.id, ada.id, main.id);
  // Main is now empty, but Downtown still has one — issuing at Main should fail.
  assertThrowsMessage(() => Transaction.issue(book.id, grace.id, main.id), 'No copies');
  // Issuing at Downtown should succeed.
  const tx = Transaction.issue(book.id, grace.id, downtown.id);
  assert.equal(tx.type, 'ISSUE');
});

test('withStats() reports a per-branch availability breakdown', () => {
  const main = Branch.getAll()[0];
  const downtown = Branch.create({ name: 'Downtown' });
  const book = Book.create({ title: 'Dune', copies: 2, branchId: main.id });
  Book.addCopies(book.id, downtown.id, 1);

  const stats = Book.withStats(Book.getById(book.id));
  const mainStats = stats.branchAvailability.find((b) => b.branchId === main.id);
  const downtownStats = stats.branchAvailability.find((b) => b.branchId === downtown.id);

  assert.equal(mainStats.total, 2);
  assert.equal(downtownStats.total, 1);
});
