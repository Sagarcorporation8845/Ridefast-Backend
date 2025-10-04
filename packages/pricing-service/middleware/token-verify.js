// packages/pricing-service/middleware/token-verify.js
const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Get token from the header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No token, authorization denied.' });
  }

  try {
    // The token format is "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token format is invalid.' });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Add the decoded payload (e.g., userId, role) to the request object
    next(); // Move on to the next piece of middleware or the route handler
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid.' });
  }
};