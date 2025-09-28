// packages/ride-service/middleware/customerAuth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate and authorize a customer JWT.
 * It checks for a valid token and ensures the 'customer' role is present.
 */
const customerAuth = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No token, authorization denied.' });
  }

  try {
    // Expecting "Bearer <token>" format
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token format is invalid.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Role-Specific Authorization Check
    // This is crucial for security. It ensures a driver cannot use this endpoint.
    if (!decoded.roles || !decoded.roles.includes('customer')) {
        return res.status(403).json({ message: 'Access denied. Customer role required.' });
    }

    // Attach user payload to the request for use in handlers
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid.' });
  }
};

module.exports = customerAuth;