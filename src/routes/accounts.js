'use strict';

const Staff = require('../models/Staff');
const { getSessionStaffId } = require('../auth');
const { sendJson } = require('../router');

function requireAdmin(req, res) {
  const currentId = getSessionStaffId(req.cookies?.session);
  if (!Staff.isAdmin(currentId)) {
    sendJson(res, 403, { error: 'Only an admin can do that.' });
    return false;
  }
  return true;
}

function register(router) {
  router.get('/api/staff', (req, res) => {
    sendJson(res, 200, Staff.getAll());
  });

  router.post('/api/staff', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { username, password, role } = req.body;
    const staff = Staff.create({ username, password, role });
    sendJson(res, 201, staff);
  });

  router.put('/api/staff/:id', (req, res) => {
    const id = Number(req.params.id);
    const currentId = getSessionStaffId(req.cookies?.session);
    const isSelf = id === currentId;
    const isAdmin = Staff.isAdmin(currentId);

    if (!isSelf && !isAdmin) {
      return sendJson(res, 403, { error: 'Only an admin can edit another account.' });
    }

    const { username, password, role } = req.body;
    // Only an admin can change a role, and only when acting on someone else's
    // account or their own — either way the "last admin" guard in the model
    // still protects against locking everyone out.
    if (role !== undefined && !isAdmin) {
      return sendJson(res, 403, { error: 'Only an admin can change roles.' });
    }

    const staff = Staff.update(id, { username, password, role });
    sendJson(res, 200, staff);
  });

  router.delete('/api/staff/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
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