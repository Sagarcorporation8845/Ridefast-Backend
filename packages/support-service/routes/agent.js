const express = require('express');
const router = express.Router();
const { authenticateAgent } = require('../middleware/ticketAuth');
const { validate, schemas } = require('../middleware/ticketValidation');
const { updateAgentStatus, getAgentWorkload } = require('../controllers/agentController');

// Update agent online/offline status
router.post('/status', 
    authenticateAgent,
    validate(schemas.updateAgentStatus),
    updateAgentStatus
);

// Get agent's current workload
router.get('/workload', 
    authenticateAgent,
    getAgentWorkload
);

module.exports = router;