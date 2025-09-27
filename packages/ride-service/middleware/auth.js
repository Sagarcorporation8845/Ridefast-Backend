// packages/ride-service/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db');

const authenticateSocket = async (ws, req) => {
  try {
    const token = req.headers['sec-websocket-protocol'];
    if (!token) {
      throw new Error('Authentication token not provided.');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Verify driver exists and is active
    const { rows } = await db.query(
      "SELECT id, city, status FROM drivers WHERE user_id = $1 AND status = 'active'",
      [userId]
    );

    if (rows.length === 0) {
      throw new Error('Driver not found or account is not active.');
    }

    // Attach driver info to the WebSocket object for use in other handlers
    ws.driverInfo = {
      driverId: rows[0].id,
      city: rows[0].city,
      userId: userId,
    };

    return true;
  } catch (err) {
    console.error('WebSocket Authentication Error:', err.message);
    ws.close(1008, err.message); // Close connection with a policy violation code
    return false;
  }
};

module.exports = { authenticateSocket };