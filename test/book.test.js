'use strict';

// Use an isolated in-memory database for this test file so it never
// touches real data. Must be set before any model (and therefore db.js)
// is required, since the connection is opened once at require time.
process.env.LIBRARY_DB_PATH = ':memory:';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertThrowsMessage } = require('./helpers');

const Book = require('../src/models/Book');
const Customer = require('../src/models/Customer');
const Transaction = require('../src/models/Transaction');

test('create() makes the requested number of copies', () => {
  const book = Book.create({ title: 'Dune', author: 'Frank Herbert', copies: 3 });
  assert.equal(book.copies.length, 3);
  assert.ok(book.copies.every((c) => !c.isIssued));
});

test('create() defaults to 1 copy when not specified', () => {
  const book = Book.create({ title: 'Foundation' });
  assert.equal(book.copies.length, 1);
});

test('create() clamps copy count to at least 1', () => {
  const book = Book.create({ title: 'Weird', copies: -5 });
  assert.equal(book.copies.length, 1);
});

test('issueCopy marks the first available copy issued, and withStats reflects it', () => {
  const book = Book.create({ title: 'Dune', copies: 2 });
  const dueDate = new Date(Date.now() + 1000).toISOString();
  Book.issueCopy(book.id, 42, dueDate);

  const updated = Book.getById(book.id);
  assert.equal(Book.availableCount(updated), 1);

  const stats = Book.withStats(updated);
  assert.equal(stats.totalCopies, 2);
  assert.equal(stats.availableCopies, 1);
});

test('issueCopy throws when no copies are available', () => {
  const book = Book.create({ title: 'Solo Copy', copies: 1 });
  Book.issueCopy(book.id, 1, new Date().toISOString());
  assertThrowsMessage(() => Book.issueCopy(book.id, 2, new Date().toISOString()), 'No copies');
});

test('returnCopy clears the copy issued to that specific customer', () => {
  const book = Book.create({ title: 'Dune', copies: 1 });
  const dueDate = new Date(Date.now() + 1000).toISOString();
  Book.issueCopy(book.id, 7, dueDate);

  const { book: after, priorDueDate } = Book.returnCopy(book.id, 7);
  assert.equal(priorDueDate, dueDate);
  assert.equal(Book.availableCount(after), 1);
});

test('returnCopy throws if that customer has no copy of the book out', () => {
  const book = Book.create({ title: 'Dune', copies: 1 });
  assertThrowsMessage(() => Book.returnCopy(book.id, 999), "doesn't have a copy");
});

test('remove() is blocked while any copy is checked out', () => {
  const book = Book.create({ title: 'Dune', copies: 1 });
  Book.issueCopy(book.id, 1, new Date().toISOString());
  assertThrowsMessage(() => Book.remove(book.id), 'still checked out');
});

test('remove() succeeds once all copies are back', () => {
  const book = Book.create({ title: 'Ephemeral' });
  assert.equal(Book.remove(book.id), true);
  assert.equal(Book.getById(book.id), null);
});

test('holds: addHold is rejected while a copy is still available', () => {
  const book = Book.create({ title: 'Plenty', copies: 2 });
  assertThrowsMessage(() => Book.addHold(book.id, 1), 'available right now');
});

test('holds: addHold succeeds once fully checked out, shiftHold returns them in order', () => {
  const book = Book.create({ title: 'Popular', copies: 1 });
  Book.issueCopy(book.id, 1, new Date().toISOString());

  Book.addHold(book.id, 2);
  Book.addHold(book.id, 3);
  assert.deepEqual(Book.getById(book.id).holds, [2, 3]);

  assert.equal(Book.shiftHold(book.id), 2);
  assert.deepEqual(Book.getById(book.id).holds, [3]);
});

test('holds: a customer cannot join the same hold queue twice', () => {
  const book = Book.create({ title: 'Popular', copies: 1 });
  Book.issueCopy(book.id, 1, new Date().toISOString());
  Book.addHold(book.id, 2);
  assertThrowsMessage(() => Book.addHold(book.id, 2), 'already in the hold queue');
});

test('end-to-end: issue is blocked for someone other than the hold holder', () => {
  const book = Book.create({ title: 'Contested', copies: 1 });
  Customer.create({ name: 'Ada' });
  Customer.create({ name: 'Grace' });
  Customer.create({ name: 'Marie' });

  Transaction.issue(book.id, 1);
  Book.addHold(book.id, 3); // Marie reserves it

  Transaction.return_(book.id, 1);

  assertThrowsMessage(() => Transaction.issue(book.id, 2), 'reserved for another member');

  const tx = Transaction.issue(book.id, 3); // Marie claims it correctly
  assert.equal(tx.type, 'ISSUE');
  assert.deepEqual(Book.getById(book.id).holds, []);
});
