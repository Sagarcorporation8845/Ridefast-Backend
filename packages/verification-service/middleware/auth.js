// packages/verification-service/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const authenticateAgent = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await query(
            'SELECT id, role, city, status FROM platform_staff WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0 || result.rows[0].status !== 'active') {
            return res.status(401).json({ message: 'Invalid token or inactive user' });
        }

        const agent = result.rows[0];
        if (!['support', 'city_admin', 'central_admin'].includes(agent.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        req.user = agent;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

module.exports = { authenticateAgent };