const { Router } = require('express');
const { verifyToken } = require('../services/jwt');
const { isInvalidated } = require('../services/cache');

const router = Router();

router.get('/whoami', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token signature' });
  }

  if (isInvalidated(payload.sessionId)) {
    return res.status(401).json({ error: 'Session has been invalidated' });
  }

  res.json({
    serviceName: 'Application Service',
    sessionId: payload.sessionId,
    jwtExp: payload.exp,
  });
});

module.exports = router;
