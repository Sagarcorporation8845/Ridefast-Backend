const jwt = require('jsonwebtoken');
const db = require('../db'); // Use your high-level query

/**
 * Authentication middleware for DRIVER-specific routes.
 * Verifies token, checks if the user is a driver, and attaches
 * driver-specific info (driverId, userId, city) to req.driverInfo.
 */
const authenticateDriver = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1]; // "Bearer <token>"
    if (!token) {
        return res.status(401).json({ message: 'Access denied. Malformed token.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // The token gives us the user_id
        const userId = decoded.userId; 

        // We need to find the corresponding driver profile
        const driverResult = await db.query(
            `SELECT 
                d.id as driver_id, 
                d.city, 
                d.status,
                u.id as user_id 
             FROM drivers d
             JOIN users u ON d.user_id = u.id
             WHERE d.user_id = $1`,
            [userId]
        );

        if (driverResult.rows.length === 0) {
            return res.status(403).json({ message: 'Forbidden. No driver profile found for this user.' });
        }

        const driver = driverResult.rows[0];

        // Attach the driver's info to the request object for controllers to use
        req.driverInfo = {
            userId: driver.user_id,
            driverId: driver.driver_id,
            city: driver.city,
            status: driver.status
        };
        
        next(); // Proceed to the controller

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token is expired.' });
        }
        res.status(401).json({ message: 'Token is not valid.' });
    }
};

// This is the line that makes the import work
module.exports = {
    authenticateDriver
};