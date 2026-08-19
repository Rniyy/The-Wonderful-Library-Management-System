'use strict';

const Staff = require('../models/Staff');
const { createSession, destroySession, getSessionStaffId } = require('../auth');
const { sendJson } = require('../router');

function register(router) {
  router.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const staff = Staff.verifyCredentials(username, password);
    if (!staff) {
      return sendJson(res, 401, { error: 'Incorrect username or password.' });
    }
    const token = createSession(staff.id);
    res.setHeader(
      'Set-Cookie',
      `session=${token}; HttpOnly; Path=/; Max-Age=${12 * 60 * 60}; SameSite=Lax`
    );
    sendJson(res, 200, { ok: true, staff });
  });

  router.post('/api/logout', (req, res) => {
    const token = req.cookies?.session;
    if (token) destroySession(token);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/me', (req, res) => {
    const staffId = getSessionStaffId(req.cookies?.session);
    const staff = staffId ? Staff.getById(staffId) : null;
    sendJson(res, 200, { staff });
  });
}

module.exports = { register };