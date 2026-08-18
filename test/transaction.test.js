'use strict';

process.env.LIBRARY_DB_PATH = ':memory:';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertThrowsMessage } = require('./helpers');

const Book = require('../src/models/Book');
const Customer = require('../src/models/Customer');
const Transaction = require('../src/models/Transaction');

function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

test('issue() sets a 14-day due date and records the transaction', () => {
  const book = Book.create({ title: 'Dune' });
  const customer = Customer.create({ name: 'Ada' });

  const tx = Transaction.issue(book.id, customer.id);
  assert.equal(tx.type, 'ISSUE');
  assert.ok(tx.dueDate);

  const daysOut = (new Date(tx.dueDate) - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(daysOut > 13.9 && daysOut < 14.1, `expected ~14 days, got ${daysOut}`);
});

test('issue() rejects an unknown book or customer', () => {
  const book = Book.create({ title: 'Dune' });
  const customer = Customer.create({ name: 'Ada' });
  assertThrowsMessage(() => Transaction.issue(999999, customer.id), 'not found');
  assertThrowsMessage(() => Transaction.issue(book.id, 999999), 'not found');
});

test('return_() flags overdue returns and computes a fine', () => {
  const book = Book.create({ title: 'Dune' });
  const customer = Customer.create({ name: 'Ada' });
  Transaction.issue(book.id, customer.id);

  // backdate the due date to simulate an overdue return — offset by half a day
  // past the boundary so the ceil-based "days late" calc can't flake if a few
  // milliseconds pass between this line and the assertion below.
  Book.renewCopy(book.id, customer.id, daysFromNow(-4.5));

  const tx = Transaction.return_(book.id, customer.id);
  assert.equal(tx.type, 'RETURN');
  assert.equal(tx.wasOverdue, true);
  assert.equal(tx.lateDays, 5);
  assert.equal(tx.fineAmount, 1.25); // 5 days (rounded up) * $0.25/day
});

test('return_() on time reports no fine', () => {
  const book = Book.create({ title: 'Dune' });
  const customer = Customer.create({ name: 'Ada' });
  Transaction.issue(book.id, customer.id);

  const tx = Transaction.return_(book.id, customer.id);
  assert.equal(tx.wasOverdue, false);
  assert.equal(tx.fineAmount, 0);
});

test('renew() extends from the current due date when not yet overdue', () => {
  const book = Book.create({ title: 'Dune' });
  const customer = Customer.create({ name: 'Ada' });
  const issueTx = Transaction.issue(book.id, customer.id);

  const renewTx = Transaction.renew(book.id, customer.id);
  assert.ok(new Date(renewTx.dueDate) > new Date(issueTx.dueDate));
});

test('renew() resets from now when already overdue', () => {
  const book = Book.create({ title: 'Dune' });
  const customer = Customer.create({ name: 'Ada' });
  Transaction.issue(book.id, customer.id);
  Book.renewCopy(book.id, customer.id, daysFromNow(-10)); // force overdue

  const renewTx = Transaction.renew(book.id, customer.id);
  const daysOut = (new Date(renewTx.dueDate) - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(daysOut > 13.9 && daysOut < 14.1, `expected ~14 days from now, got ${daysOut}`);
});

test('outstandingFines() sums fines across every overdue copy', () => {
  const bookA = Book.create({ title: 'A' });
  const bookB = Book.create({ title: 'B' });
  const ada = Customer.create({ name: 'Ada' });
  const grace = Customer.create({ name: 'Grace' });

  Transaction.issue(bookA.id, ada.id);
  Book.renewCopy(bookA.id, ada.id, daysFromNow(-2.5)); // 3 days late (rounded up) => $0.75

  Transaction.issue(bookB.id, grace.id);
  Book.renewCopy(bookB.id, grace.id, daysFromNow(-4.5)); // 5 days late (rounded up) => $1.25

  assert.equal(Transaction.outstandingFines(), 2);
});

test('leaderboard() ranks books and members by number of issues', () => {
  const popular = Book.create({ title: 'Popular', copies: 5 });
  const rare = Book.create({ title: 'Rare', copies: 5 });
  const ada = Customer.create({ name: 'Ada' });
  const grace = Customer.create({ name: 'Grace' });

  Transaction.issue(popular.id, ada.id);
  Transaction.return_(popular.id, ada.id);
  Transaction.issue(popular.id, ada.id);
  Transaction.return_(popular.id, ada.id);
  Transaction.issue(popular.id, grace.id);
  Transaction.return_(popular.id, grace.id);
  Transaction.issue(rare.id, grace.id);
  Transaction.return_(rare.id, grace.id);
  Transaction.issue(rare.id, grace.id);

  const board = Transaction.leaderboard();
  assert.equal(board.books[0].bookId, popular.id);
  assert.equal(board.books[0].count, 3);

  // grace: 3 issues (popular x1, rare x2), ada: 2 issues — grace should lead unambiguously
  assert.equal(board.members[0].customerId, grace.id);
  assert.equal(board.members[0].count, 3);
});
