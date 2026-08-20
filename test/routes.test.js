'use strict';

process.env.LIBRARY_DB_PATH = ':memory:';
process.env.STAFF_USERNAME = 'admin';
process.env.STAFF_PASSWORD = 'testpass1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { server } = require('../server');
const { TestClient } = require('./testClient');

let port;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function client() {
  return new TestClient(port);
}

test('unauthenticated requests to protected API routes get 401', async () => {
  const res = await client().get('/api/books');
  assert.equal(res.status, 401);
});

test('static files are public even when signed out', async () => {
  const res = await client().get('/');
  assert.equal(res.status, 200);
});

test('an unknown static path 404s', async () => {
  const res = await client().get('/definitely-not-a-real-file.xyz');
  assert.equal(res.status, 404);
});

test('login rejects a wrong password', async () => {
  const res = await client().post('/api/login', { username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('login succeeds with the bootstrapped admin account and sets a session cookie', async () => {
  const c = client();
  const res = await c.post('/api/login', { username: 'admin', password: 'testpass1' });
  assert.equal(res.status, 200);
  assert.equal(res.json.staff.role, 'admin');
  assert.ok(c.cookie, 'expected a session cookie to be set');
});

test('an authenticated request succeeds using the session cookie', async () => {
  const c = client();
  await c.post('/api/login', { username: 'admin', password: 'testpass1' });
  const res = await c.get('/api/books');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});

test('logout clears the session, so a subsequent request is unauthenticated again', async () => {
  const c = client();
  await c.post('/api/login', { username: 'admin', password: 'testpass1' });
  await c.post('/api/logout');
  const res = await c.get('/api/books');
  assert.equal(res.status, 401);
});

test('full book lifecycle over HTTP: create, issue, block a second issue, return', async () => {
  const c = client();
  await c.post('/api/login', { username: 'admin', password: 'testpass1' });

  const bookRes = await c.post('/api/books', { title: 'Dune', author: 'Frank Herbert', copies: 1 });
  assert.equal(bookRes.status, 201);
  const bookId = bookRes.json.id;

  const custRes = await c.post('/api/customers', { name: 'Ada Lovelace' });
  assert.equal(custRes.status, 201);
  const customerId = custRes.json.id;

  const issueRes = await c.post('/api/transactions/issue', { bookId, customerId, branchId: 1 });
  assert.equal(issueRes.status, 201);
  assert.equal(issueRes.json.type, 'ISSUE');

  const secondIssue = await c.post('/api/transactions/issue', { bookId, customerId: customerId, branchId: 1 });
  assert.equal(secondIssue.status, 409); // already issued, no copies left

  const returnRes = await c.post('/api/transactions/return', { bookId, customerId });
  assert.equal(returnRes.status, 201);
  assert.equal(returnRes.json.type, 'RETURN');
});

test('a non-admin cannot create staff accounts over HTTP', async () => {
  const admin = client();
  await admin.post('/api/login', { username: 'admin', password: 'testpass1' });
  await admin.post('/api/staff', { username: 'regular', password: 'regularpass1' }); // defaults to role: staff

  const staffUser = client();
  await staffUser.post('/api/login', { username: 'regular', password: 'regularpass1' });

  const res = await staffUser.post('/api/staff', { username: 'sneaky', password: 'sneakypass1' });
  assert.equal(res.status, 403);
});

test('validation errors come back with 400 and a helpful message', async () => {
  const c = client();
  await c.post('/api/login', { username: 'admin', password: 'testpass1' });
  const res = await c.post('/api/books', { author: 'No Title Here' }); // missing required title
  assert.equal(res.status, 400);
  assert.match(res.json.error, /title/i);
});

test('malformed JSON body is rejected with 400 rather than crashing the server', async () => {
  const c = client();
  await c.post('/api/login', { username: 'admin', password: 'testpass1' });

  const res = await new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request(
      { host: 'localhost', port, path: '/api/books', method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.cookie } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => resolve({ status: res.statusCode }));
      }
    );
    req.on('error', reject);
    req.write('{ not valid json');
    req.end();
  });
  assert.equal(res.status, 400);

  // and the server should still be perfectly usable right after
  const followUp = await c.get('/api/books');
  assert.equal(followUp.status, 200);
});
