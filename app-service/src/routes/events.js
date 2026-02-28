const { Router } = require('express');
const express = require('express');
const { confirmSubscription } = require('../services/sns');
const { addInvalidation } = require('../services/cache');

const router = Router();

router.post('/events', express.text({ type: '*/*' }), async (req, res) => {
  let body;
  try {
    body = JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const messageType = req.headers['x-amz-sns-message-type'];

  if (messageType === 'SubscriptionConfirmation') {
    await confirmSubscription(body.Token);
    return res.sendStatus(200);
  }

  if (messageType === 'Notification') {
    let message;
    try {
      message = JSON.parse(body.Message);
    } catch {
      console.error('Failed to parse SNS message:', body.Message);
      return res.status(400).json({ error: 'Invalid message payload' });
    }

    if (!message.sessionId || !message.expiration) {
      console.error('Missing fields in SNS message:', message);
      return res.status(400).json({ error: 'Missing sessionId or expiration' });
    }

    addInvalidation(message.sessionId, message.expiration);
    console.log(`Invalidation received: ${message.sessionId}`);
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

module.exports = router;
