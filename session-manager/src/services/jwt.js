const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(__dirname, '../keys/private.pem'));

function signToken({ username, sessionId, exp }) {
  return jwt.sign({ username, sessionId, exp }, privateKey, {
    algorithm: 'RS256',
  });
}

module.exports = { signToken };
