// packages/ride-service/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db');
const url = require('url');

const authenticateSocket = async (req) => {
    try {
        const protocols = req.headers['sec-websocket-protocol'] ? req.headers['sec-websocket-protocol'].split(',').map(s => s.trim()) : [];
        const roleProtocol = protocols.find(p => p === 'driver-protocol' || p === 'customer-protocol');
        const token = protocols.find(p => p !== roleProtocol);

        if (!token || !roleProtocol) {
            throw new Error('Authentication token or role protocol not provided.');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        if (roleProtocol === 'driver-protocol') {
            if (!decoded.roles || !decoded.roles.includes('driver')) {
                throw new Error('Token does not have driver role.');
            }
            const { rows } = await db.query(
                "SELECT id, status FROM drivers WHERE user_id = $1 AND status = 'active'",
                [userId]
            );
            if (rows.length === 0) {
                throw new Error('Driver not found or account is not active.');
            }
            return { isAuthenticated: true, role: 'driver', userId, driverId: rows[0].id };
        } 
        
        if (roleProtocol === 'customer-protocol') {
            if (!decoded.roles || !decoded.roles.includes('customer')) {
                throw new Error('Token does not have customer role.');
            }
            // Basic check if user exists
            const { rows } = await db.query("SELECT id FROM users WHERE id = $1", [userId]);
            if (rows.length === 0) {
                throw new Error('Customer not found.');
            }
            return { isAuthenticated: true, role: 'customer', userId, driverId: null };
        }

        throw new Error('Invalid role protocol.');

    } catch (err) {
        console.error('WebSocket Authentication Error:', err.message);
        return { isAuthenticated: false };
    }
};

module.exports = { authenticateSocket };