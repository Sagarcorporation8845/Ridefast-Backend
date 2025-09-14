const express = require('express');
const router = express.Router();
const { authenticateAgent, checkTicketAccess } = require('../middleware/ticketAuth');
const { validate, schemas } = require('../middleware/ticketValidation');
const { 
    createTicket, 
    getAgentTickets, 
    getTicketDetails, 
    updateTicketStatus, 
    addTicketMessage 
} = require('../controllers/ticketController');

// Create new ticket
router.post('/', 
    authenticateAgent,
    validate(schemas.createTicket),
    createTicket
);

// Get agent's assigned tickets
router.get('/', 
    authenticateAgent,
    getAgentTickets
);

// Get specific ticket details
router.get('/:id', 
    authenticateAgent,
    checkTicketAccess,
    getTicketDetails
);

// Update ticket status
router.put('/:id/status', 
    authenticateAgent,
    checkTicketAccess,
    validate(schemas.updateTicketStatus),
    updateTicketStatus
);

// Add message to ticket
router.post('/:id/messages', 
    authenticateAgent,
    checkTicketAccess,
    validate(schemas.addTicketMessage),
    addTicketMessage
);

// Get ticket messages (already included in getTicketDetails)
router.get('/:id/messages', 
    authenticateAgent,
    checkTicketAccess,
    (req, res) => {
        // Redirect to ticket details which includes messages
        res.redirect(`/tickets/${req.params.id}`);
    }
);

module.exports = router;