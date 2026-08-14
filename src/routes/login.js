'use strict';

const { checkPassword, createSession, destroySession } = require('../auth');
const { sendJson } = require('../router');

function register(router) {
  router.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (!checkPassword(password)) {
      return sendJson(res, 401, { error: 'Incorrect password.' });
    }
    const token = createSession();
    res.setHeader(
      'Set-Cookie',
      `session=${token}; HttpOnly; Path=/; Max-Age=${12 * 60 * 60}; SameSite=Lax`
    );
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/logout', (req, res) => {
    const token = req.cookies?.session;
    if (token) destroySession(token);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
