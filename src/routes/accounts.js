'use strict';

const Staff = require('../models/Staff');
const { getSessionStaffId } = require('../auth');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/staff', (req, res) => {
    sendJson(res, 200, Staff.getAll());
  });

  router.post('/api/staff', (req, res) => {
    const { username, password } = req.body;
    const staff = Staff.create({ username, password });
    sendJson(res, 201, staff);
  });

  router.put('/api/staff/:id', (req, res) => {
    const { username, password } = req.body;
    const staff = Staff.update(Number(req.params.id), { username, password });
    sendJson(res, 200, staff);
  });

  router.delete('/api/staff/:id', (req, res) => {
    const id = Number(req.params.id);
    const currentId = getSessionStaffId(req.cookies?.session);
    if (id === currentId) {
      return sendJson(res, 409, { error: "Can't remove the account you're currently signed in as." });
    }
    Staff.remove(id);
    sendJson(res, 200, { removed: true });
  });
}

module.exports = { register };
