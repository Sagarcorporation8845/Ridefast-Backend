const jwt = require('jsonwebtoken');
const { query } = require('../db');

// Authentication middleware for support agents
const authenticateAgent = async (req, res, next) => {
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
        
        // Fetch agent details from database
        const result = await query(
            'SELECT id, full_name, email, role, city, status FROM platform_staff WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: {
                    type: 'AUTHENTICATION_ERROR',
                    message: 'Invalid token - agent not found',
                    timestamp: new Date()
                }
            });
        }

        const agent = result.rows[0];
        
        if (agent.status !== 'active') {
            return res.status(401).json({
                error: {
                    type: 'AUTHENTICATION_ERROR',
                    message: 'Agent account is not active',
                    timestamp: new Date()
                }
            });
        }

        if (agent.role !== 'support') {
            return res.status(403).json({
                error: {
                    type: 'AUTHORIZATION_ERROR',
                    message: 'Access denied - support role required',
                    timestamp: new Date()
                }
            });
        }

        req.agent = agent;
        next();
    } catch (error) {
        console.error('Agent authentication error:', error);
        return res.status(403).json({
            error: {
                type: 'AUTHENTICATION_ERROR',
                message: 'Invalid or expired token',
                timestamp: new Date()
            }
        });
    }
};

// Middleware to check if agent can access specific ticket
const checkTicketAccess = async (req, res, next) => {
    try {
        const { id: ticketId } = req.params;
        
        // Check if ticket exists and is in agent's city
        const result = await query(
            `SELECT id, city, assigned_agent_id, status 
             FROM support_tickets 
             WHERE id = $1 AND city = $2`,
            [ticketId, req.agent.city]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    type: 'RESOURCE_NOT_FOUND',
                    message: 'Ticket not found or access denied',
                    timestamp: new Date()
                }
            });
        }

        const ticket = result.rows[0];
        
        // Agent can only access tickets assigned to them or unassigned tickets in their city
        if (ticket.assigned_agent_id && ticket.assigned_agent_id !== req.agent.id) {
            return res.status(403).json({
                error: {
                    type: 'AUTHORIZATION_ERROR',
                    message: 'Access denied - ticket assigned to another agent',
                    timestamp: new Date()
                }
            });
        }

        req.ticket = ticket;
        next();
    } catch (error) {
        console.error('Ticket access check error:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to verify ticket access',
                timestamp: new Date()
            }
        });
    }
};

module.exports = {
    authenticateAgent,
    checkTicketAccess
};