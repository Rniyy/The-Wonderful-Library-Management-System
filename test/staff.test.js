'use strict';

process.env.LIBRARY_DB_PATH = ':memory:';
process.env.STAFF_USERNAME = 'admin';
process.env.STAFF_PASSWORD = 'testpass1';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertThrowsMessage } = require('./helpers');

const Staff = require('../src/models/Staff');

test('bootstrap creates exactly one admin account', () => {
  const all = Staff.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].role, 'admin');
});

test('create() defaults to the staff role', () => {
  const s = Staff.create({ username: 'jessy', password: 'secret123' });
  assert.equal(s.role, 'staff');
});

test('create() rejects a short password', () => {
  assertThrowsMessage(() => Staff.create({ username: 'x', password: 'ab' }), 'at least 4');
});

test('create() rejects a duplicate username', () => {
  Staff.create({ username: 'grace', password: 'secret123' });
  assertThrowsMessage(() => Staff.create({ username: 'grace', password: 'other1234' }), 'already taken');
});

test('verifyCredentials() returns null for a wrong password, staff on success', () => {
  Staff.create({ username: 'ada', password: 'correct123' });
  assert.equal(Staff.verifyCredentials('ada', 'wrong'), null);
  const ok = Staff.verifyCredentials('ada', 'correct123');
  assert.equal(ok.username, 'ada');
});

test('update() can change username and password independently', () => {
  const s = Staff.create({ username: 'marie', password: 'original1' });
  const renamed = Staff.update(s.id, { username: 'marie2' });
  assert.equal(renamed.username, 'marie2');
  assert.equal(Staff.verifyCredentials('marie2', 'original1').id, s.id);

  Staff.update(s.id, { password: 'newpass99' });
  assert.equal(Staff.verifyCredentials('marie2', 'original1'), null);
  assert.equal(Staff.verifyCredentials('marie2', 'newpass99').id, s.id);
});

test("remove() is blocked while it's the last account", () => {
  const onlyAccount = Staff.getAll()[0];
  // remove everyone else first so this really is the last one
  for (const s of Staff.getAll()) {
    if (s.id !== onlyAccount.id) Staff.remove(s.id);
  }
  assertThrowsMessage(() => Staff.remove(onlyAccount.id), 'last staff account');
});

test('update() is blocked from demoting the last admin', () => {
  const admin = Staff.getAll().find((s) => s.role === 'admin');
  assertThrowsMessage(() => Staff.update(admin.id, { role: 'staff' }), 'last admin');
});

test('update() allows demotion once a second admin exists', () => {
  const admin = Staff.getAll().find((s) => s.role === 'admin');
  const second = Staff.create({ username: 'backup-admin', password: 'admin1234', role: 'admin' });
  const demoted = Staff.update(admin.id, { role: 'staff' });
  assert.equal(demoted.role, 'staff');
  assert.equal(Staff.isAdmin(second.id), true);
});

test("remove() is blocked when it's the last admin, even if other staff exist", () => {
  const admin = Staff.getAll().find((s) => s.role === 'admin');
  Staff.create({ username: 'regular-staff', password: 'staffpass1' }); // role: staff, doesn't count
  assertThrowsMessage(() => Staff.remove(admin.id), 'last admin');
});
