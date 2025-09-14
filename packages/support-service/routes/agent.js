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

// Manual assignment of unassigned tickets (City Admin only)
router.post('/assign-unassigned', 
    authenticateAgent,
    async (req, res) => {
        try {
            // Only city admins and central admins can trigger manual assignment
            if (!['city_admin', 'central_admin'].includes(req.agent.role)) {
                return res.status(403).json({
                    error: {
                        type: 'AUTHORIZATION_ERROR',
                        message: 'Access denied - city admin or central admin role required',
                        timestamp: new Date()
                    }
                });
            }

            const TicketAssignmentEngine = require('../services/TicketAssignmentEngine');
            const assignmentEngine = new TicketAssignmentEngine();
            
            const results = await assignmentEngine.assignAllUnassignedTickets(req.agent.city);
            
            res.json({
                success: results.success,
                message: results.message,
                data: {
                    city: req.agent.city,
                    assignedCount: results.assignedCount,
                    unassignedCount: results.unassignedCount,
                    tickets: results.tickets,
                    timestamp: new Date()
                }
            });
            
        } catch (error) {
            console.error('Error in manual assignment:', error);
            res.status(500).json({
                error: {
                    type: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to process manual assignment',
                    timestamp: new Date()
                }
            });
        }
    }
);

module.exports = router;