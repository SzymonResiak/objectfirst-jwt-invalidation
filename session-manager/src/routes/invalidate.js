const { Router } = require('express');
const { getSession, invalidateSession } = require('../services/dynamodb');
const { publishInvalidation } = require('../services/sns');

const router = Router();

router.post('/session/:sessionId/invalidate', async (req, res) => {
  const { sessionId } = req.params;

  const session = await getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  await invalidateSession(sessionId);
  await publishInvalidation({ sessionId, expiration: session.expiration });

  res.json({ message: 'Session invalidated' });
});

module.exports = router;
