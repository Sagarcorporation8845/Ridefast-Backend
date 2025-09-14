const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, requireCityAccess } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createAgent, getAgents, updateAgentStatus } = require('../controllers/agentController');

// Create support agent (city_admin and central_admin only)
router.post('/', 
    authenticateToken,
    requireRole(['city_admin', 'central_admin']),
    validate(schemas.createAgent),
    requireCityAccess,
    createAgent
);

// Get agents (all admin roles)
router.get('/', 
    authenticateToken,
    requireRole(['city_admin', 'central_admin']),
    requireCityAccess,
    getAgents
);

// Update agent status (city_admin and central_admin only)
router.put('/:id/status', 
    authenticateToken,
    requireRole(['city_admin', 'central_admin']),
    validate(schemas.updateAgentStatus),
    requireCityAccess,
    updateAgentStatus
);

module.exports = router;