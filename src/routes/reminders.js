'use strict';

const Reminder = require('../models/Reminder');
const { isConfigured } = require('../notifications/notifier');
const { sendJson } = require('../router');

function register(router) {
  router.get('/api/reminders/due', (req, res) => {
    sendJson(res, 200, { webhookConfigured: isConfigured(), due: Reminder.findDue() });
  });

  router.post('/api/reminders/send', async (req, res) => {
    const summary = await Reminder.sendDueReminders();
    sendJson(res, 200, { ...summary, webhookConfigured: isConfigured() });
  });
}

module.exports = { register };
