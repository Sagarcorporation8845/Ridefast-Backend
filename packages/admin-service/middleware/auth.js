const jwt = require('jsonwebtoken');
const { query } = require('../db');

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            error: {
                type: 'AUTHENTICATION_ERROR',
                message: 'Access token required',
                timestamp: new Date()
            }
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch user details from database
        const result = await query(
            'SELECT id, full_name, email, role, city, status FROM platform_staff WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: {
                    type: 'AUTHENTICATION_ERROR',
                    message: 'Invalid token - user not found',
                    timestamp: new Date()
                }
            });
        }

        const user = result.rows[0];
        
        if (user.status !== 'active') {
            return res.status(401).json({
                error: {
                    type: 'AUTHENTICATION_ERROR',
                    message: 'Account is not active',
                    timestamp: new Date()
                }
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(403).json({
            error: {
                type: 'AUTHENTICATION_ERROR',
                message: 'Invalid or expired token',
                timestamp: new Date()
            }
        });
    }
};

// Authorization middleware for role-based access
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: {
                    type: 'AUTHENTICATION_ERROR',
                    message: 'Authentication required',
                    timestamp: new Date()
                }
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: {
                    type: 'AUTHORIZATION_ERROR',
                    message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
                    timestamp: new Date()
                }
            });
        }

        next();
    };
};

// City-based access control middleware
const requireCityAccess = (req, res, next) => {
    const { city } = req.params;
    const requestedCity = city || req.query.city || req.body.city;

    // Central admin has access to all cities
    if (req.user.role === 'central_admin') {
        return next();
    }

    // City admin and support can only access their assigned city
    if (req.user.role === 'city_admin' || req.user.role === 'support') {
        if (!req.user.city) {
            return res.status(403).json({
                error: {
                    type: 'AUTHORIZATION_ERROR',
                    message: 'No city assigned to user',
                    timestamp: new Date()
                }
            });
        }

        if (requestedCity && requestedCity !== req.user.city) {
            return res.status(403).json({
                error: {
                    type: 'AUTHORIZATION_ERROR',
                    message: `Access denied to city: ${requestedCity}`,
                    timestamp: new Date()
                }
            });
        }

        // Add user's city to request for filtering
        req.userCity = req.user.city;
    }

    next();
};

module.exports = {
    authenticateToken,
    requireRole,
    requireCityAccess
};