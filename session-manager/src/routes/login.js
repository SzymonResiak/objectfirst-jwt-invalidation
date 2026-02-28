const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { signToken } = require('../services/jwt');
const { createSession } = require('../services/dynamodb');

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== 'admin' || password !== 'password123') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const sessionId = uuidv4();
  const expiration = Math.floor(Date.now() / 1000) + 180; // 3 minutes
  const token = signToken({ username, sessionId, exp: expiration });

  await createSession({ sessionId, username, expiration });

  res.json({ token });
});

module.exports = router;
