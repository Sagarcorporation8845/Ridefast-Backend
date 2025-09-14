const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, requireCityAccess } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { getReassignmentCandidates, reassignTicket } = require('../controllers/ticketController');

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