'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rateLimiter = require('../src/rateLimiter');

test('a fresh key is never locked', () => {
  const status = rateLimiter.isLocked('fresh-key-1');
  assert.equal(status.locked, false);
});

test('locks out after MAX_ATTEMPTS failures', () => {
  const key = 'brute-force-1';
  for (let i = 0; i < rateLimiter.MAX_ATTEMPTS - 1; i++) {
    rateLimiter.recordFailure(key);
    assert.equal(rateLimiter.isLocked(key).locked, false, `should not be locked after ${i + 1} failures`);
  }
  rateLimiter.recordFailure(key); // this one crosses the threshold
  const status = rateLimiter.isLocked(key);
  assert.equal(status.locked, true);
  assert.ok(status.retryAfterMs > 0);
});

test('recordSuccess clears any accumulated failures', () => {
  const key = 'recovers-1';
  for (let i = 0; i < rateLimiter.MAX_ATTEMPTS - 1; i++) rateLimiter.recordFailure(key);
  rateLimiter.recordSuccess(key);
  assert.equal(rateLimiter.isLocked(key).locked, false);

  // and the failure count actually reset, not just the lock — one more
  // failure shouldn't trip it immediately
  rateLimiter.recordFailure(key);
  assert.equal(rateLimiter.isLocked(key).locked, false);
});

test('different keys are tracked independently', () => {
  const keyA = 'independent-a';
  const keyB = 'independent-b';
  for (let i = 0; i < rateLimiter.MAX_ATTEMPTS; i++) rateLimiter.recordFailure(keyA);
  assert.equal(rateLimiter.isLocked(keyA).locked, true);
  assert.equal(rateLimiter.isLocked(keyB).locked, false);
});
