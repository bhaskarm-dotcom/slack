const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const header = req.headers['authorization'];
  const token  = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function verifySocketToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { authenticateToken, verifySocketToken };
