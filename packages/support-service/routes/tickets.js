const express = require('express');
const router = express.Router();
const { authenticateAgent, checkTicketAccess } = require('../middleware/ticketAuth');
const tokenVerify = require('../middleware/token-verify');
const { validate, schemas } = require('../middleware/ticketValidation');
const { 
    createTicket, 
    getAgentTickets, 
    getTicketDetails, 
    updateTicketStatus, 
    addTicketMessage,
    createUserTicket,
    getUserTickets
} = require('../controllers/ticketController');

// --- USER/DRIVER ROUTES ---
// These routes MUST come before any routes with dynamic /:id parameters.

// Create a ticket as a user/driver
router.post('/user', tokenVerify, validate(schemas.createUserTicket), createUserTicket);

// Get the user's/driver's own ticket history
router.get('/user', tokenVerify, getUserTickets);


// --- AGENT-SPECIFIC ROUTES ---

// Create new ticket by an agent
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

// Get specific ticket details (This now comes AFTER /user)
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

module.exports = router;