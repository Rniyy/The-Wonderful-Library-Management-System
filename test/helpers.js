'use strict';

const assert = require('node:assert/strict');

/**
 * Our models throw plain { status, message } objects (not Error instances) —
 * that's what the router expects to turn into an HTTP response. assert.throws
 * with a RegExp only works against a real Error's .message, so this helper
 * checks our actual convention instead.
 */
function assertThrowsMessage(fn, substring, expectedStatus) {
  let thrown = null;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'expected function to throw');
  assert.ok(
    typeof thrown.message === 'string' && thrown.message.includes(substring),
    `expected error message to include "${substring}", got: ${thrown.message}`
  );
  if (expectedStatus !== undefined) {
    assert.equal(thrown.status, expectedStatus);
  }
}

module.exports = { assertThrowsMessage };
