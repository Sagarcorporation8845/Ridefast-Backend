const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, requireCityAccess } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const {     getReassignmentCandidates,
            reassignTicket,
            getEscalatedQueue,    
            adminResolveTicket} = require('../controllers/ticketController');

/**
 * @route POST /api/admin/tickets/:id/resolve
 * @desc Admin resolves an escalated ticket
 */
router.post(
    '/:id/resolve',
    authenticateToken, // Use your correct auth middleware
    requireRole(['city_admin', 'central_admin']),
    validate(schemas.adminResolveTicket), // We will add this schema
    adminResolveTicket
);

/**
 * @route GET /api/admin/tickets/queue/escalated
 * @desc Gets all tickets escalated to the admin's level
 */
router.get(
    '/queue/escalated',
    authenticateToken, // Use your correct auth middleware
    requireRole(['city_admin', 'central_admin']),
    getEscalatedQueue
);

// Get reassignment candidates (city_admin and central_admin only)
router.get('/reassign', 
    authenticateToken,
    requireRole(['city_admin', 'central_admin']),
    requireCityAccess,
    getReassignmentCandidates
);

// Reassign ticket (city_admin and central_admin only)
router.post('/:id/reassign', 
    authenticateToken,
    requireRole(['city_admin', 'central_admin']),
    validate(schemas.reassignTicket),
    requireCityAccess,
    reassignTicket
);

module.exports = router;