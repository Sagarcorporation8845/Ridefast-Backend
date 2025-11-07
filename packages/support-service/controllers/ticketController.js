const { query } = require('../db');
const TicketAssignmentEngine = require('../services/TicketAssignmentEngine');

// Create new ticket (for customers via support agent)
const createTicket = async (req, res) => {
    try {
        const { customerId, subject, description, priority = 'normal', type = 'text' } = req.body;
        
        // Verify customer exists
        const customerResult = await query(
            'SELECT id FROM users WHERE id = $1',
            [customerId]
        );
        
        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    type: 'RESOURCE_NOT_FOUND',
                    message: 'Customer not found',
                    timestamp: new Date()
                }
            });
        }
        
        // Create ticket
        const result = await query(
            `INSERT INTO support_tickets (customer_id, city, subject, description, priority, type, created_by_agent_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, customer_id, city, subject, description, priority, type, status, created_at`,
            [customerId, req.agent.city, subject, description, priority, type, req.agent.id]
        );
        
        const newTicket = result.rows[0];
        
        // Try to auto-assign the ticket
        const assignmentEngine = new TicketAssignmentEngine();
        await assignmentEngine.assignTicket(newTicket.id, req.agent.city);
        
        // Fetch updated ticket with assignment info
        const updatedResult = await query(
            `SELECT st.*, ps.full_name as assigned_agent_name, u.full_name as customer_name
             FROM support_tickets st
             LEFT JOIN platform_staff ps ON st.assigned_agent_id = ps.id
             LEFT JOIN users u ON st.customer_id = u.id
             WHERE st.id = $1`,
            [newTicket.id]
        );
        
        const ticket = updatedResult.rows[0];
        
        res.status(201).json({
            success: true,
            data: {
                ticket: {
                    id: ticket.id,
                    customerId: ticket.customer_id,
                    customerName: ticket.customer_name,
                    assignedAgentId: ticket.assigned_agent_id,
                    assignedAgentName: ticket.assigned_agent_name,
                    city: ticket.city,
                    subject: ticket.subject,
                    description: ticket.description,
                    priority: ticket.priority,
                    type: ticket.type,
                    status: ticket.status,
                    createdAt: ticket.created_at
                }
            }
        });
        
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to create ticket',
                timestamp: new Date()
            }
        });
    }
};

// Get agent's assigned tickets
const getAgentTickets = async (req, res) => {
    // const this_is_an_intentional_error = check;
    try {
        const { status, priority } = req.query;
        
        let whereClause = 'WHERE st.assigned_agent_id = $1';
        const params = [req.agent.id];
        
        if (status) {
            whereClause += ' AND st.status = $2';
            params.push(status);
        }
        
        if (priority) {
            const priorityIndex = params.length + 1;
            whereClause += ` AND st.priority = $${priorityIndex}`;
            params.push(priority);
        }
        
        const result = await query(
            `SELECT st.id, st.subject, st.status, st.priority, st.created_at, ps.full_name as assigned_agent_name
     FROM support_tickets st
     LEFT JOIN platform_staff ps ON st.assigned_agent_id = ps.id
     WHERE st.assigned_agent_id = $1
       AND st.escalation_level = 'none'
       AND st.status NOT IN ('resolved', 'closed')
             ORDER BY 
                CASE st.priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'normal' THEN 3 
                    WHEN 'low' THEN 4 
                END,
                st.created_at ASC`,
            params
        );
        
        const tickets = result.rows.map(row => ({
            id: row.id,
            customerId: row.customer_id,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            city: row.city,
            subject: row.subject,
            description: row.description,
            priority: row.priority,
            type: row.type,
            status: row.status,
            createdAt: row.created_at,
            assignedAt: row.assigned_at,
            resolvedAt: row.resolved_at,
            closedAt: row.closed_at
        }));
        
        res.json({
            success: true,
            data: { tickets }
        });
        
    } catch (error) {
        console.error('Error fetching agent tickets:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to fetch tickets',
                timestamp: new Date()
            }
        });
    }
};

// Get specific ticket details
const getTicketDetails = async (req, res) => {
    try {
        const { id: ticketId } = req.params;
        
        // Get ticket details
        const ticketResult = await query(
            `SELECT st.*, u.full_name as customer_name, u.phone_number as customer_phone, u.email as customer_email
             FROM support_tickets st
             LEFT JOIN users u ON st.customer_id = u.id
             WHERE st.id = $1`,
            [ticketId]
        );
        
        if (ticketResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    type: 'RESOURCE_NOT_FOUND',
                    message: 'Ticket not found',
                    timestamp: new Date()
                }
            });
        }
        
        const ticket = ticketResult.rows[0];
        
        // Get ticket messages
        const messagesResult = await query(
            `SELECT tm.*, 
                    CASE 
                        WHEN tm.sender_type = 'customer' THEN u.full_name
                        WHEN tm.sender_type = 'agent' THEN ps.full_name
                    END as sender_name
             FROM ticket_messages tm
             LEFT JOIN users u ON tm.sender_id = u.id AND tm.sender_type = 'customer'
             LEFT JOIN platform_staff ps ON tm.sender_id = ps.id AND tm.sender_type = 'agent'
             WHERE tm.ticket_id = $1
             ORDER BY tm.created_at ASC`,
            [ticketId]
        );
        
        const messages = messagesResult.rows.map(row => ({
            id: row.id,
            senderId: row.sender_id,
            senderName: row.sender_name,
            senderType: row.sender_type,
            message: row.message,
            isInternal: row.is_internal,
            attachments: row.attachments,
            createdAt: row.created_at
        }));
        
        res.json({
            success: true,
            data: {
                ticket: {
                    id: ticket.id,
                    customerId: ticket.customer_id,
                    customerName: ticket.customer_name,
                    customerPhone: ticket.customer_phone,
                    customerEmail: ticket.customer_email,
                    assignedAgentId: ticket.assigned_agent_id,
                    city: ticket.city,
                    subject: ticket.subject,
                    description: ticket.description,
                    priority: ticket.priority,
                    type: ticket.type,
                    status: ticket.status,
                    createdAt: ticket.created_at,
                    assignedAt: ticket.assigned_at,
                    resolvedAt: ticket.resolved_at,
                    closedAt: ticket.closed_at
                },
                messages
            }
        });
        
    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to fetch ticket details',
                timestamp: new Date()
            }
        });
    }
};

/**
 * Updates a ticket's status and handles agent count changes.
 * If a ticket is resolved/closed, it tries to assign a new ticket.
 */
const updateTicketStatus = async (req, res) => {
    const { id: ticketId } = req.params;
    const { status } = req.body;
    
    let assignedAgentIdBeforeUpdate = null;
    let cityOfTicket = null;
    let statusBeforeUpdate = null;
    let agentBecameAvailable = false;

    try {
        // --- Use high-level query for transaction ---
        await query('BEGIN');

        // Fetch current ticket state and lock the row
        const ticketResult = await query(
            'SELECT id, status, assigned_agent_id, city FROM support_tickets WHERE id = $1 FOR UPDATE', 
            [ticketId]
        );
        if (ticketResult.rows.length === 0) { 
            await query('ROLLBACK');
            return res.status(404).json({ error: { message: 'Ticket not found' } });
        }
        
        const currentTicket = ticketResult.rows[0];
        assignedAgentIdBeforeUpdate = currentTicket.assigned_agent_id;
        cityOfTicket = currentTicket.city;
        statusBeforeUpdate = currentTicket.status;

        // --- Status transition validation ---
        const validTransitions = {
             'open': ['in_progress'],
             'in_progress': ['pending_customer', 'resolved'],
             'pending_customer': ['in_progress', 'resolved'],
             'resolved': ['closed', 'open'],
             'closed': ['open']
         };
        if (!validTransitions[currentTicket.status]?.includes(status)) {
            await query('ROLLBACK');
            return res.status(400).json({ error: { message: `Invalid status transition from ${currentTicket.status} to ${status}` } });
        }
        
        // --- Build Update Query ---
        let updateQuery = 'UPDATE support_tickets SET status = $1';
        const params = [status, ticketId];
        if (status === 'resolved' && currentTicket.status !== 'resolved') updateQuery += `, resolved_at = NOW()`;
        else if (status === 'closed' && currentTicket.status !== 'closed') updateQuery += `, closed_at = NOW()`;
        else if (status === 'open' && (currentTicket.status === 'resolved' || currentTicket.status === 'closed')) updateQuery += `, resolved_at = NULL, closed_at = NULL`;
        updateQuery += ` WHERE id = $2 RETURNING *`;
        
        const result = await query(updateQuery, params);
        const updatedTicket = result.rows[0];

        // --- Manually Increment/Decrement Count ---
        if (assignedAgentIdBeforeUpdate) { 
             if (['resolved', 'closed'].includes(status) && !['resolved', 'closed'].includes(statusBeforeUpdate)) {
                 await query(
                     `UPDATE agent_status SET active_tickets_count = GREATEST(active_tickets_count - 1, 0) WHERE agent_id = $1`,
                     [assignedAgentIdBeforeUpdate]
                 );
                 agentBecameAvailable = true; 
                 console.log(`[DEBUG updateTicketStatus] Decremented count for agent ${assignedAgentIdBeforeUpdate}`);
             } else if (!['resolved', 'closed'].includes(status) && ['resolved', 'closed'].includes(statusBeforeUpdate)) {
                 await query(
                     `INSERT INTO agent_status (agent_id, active_tickets_count) VALUES ($1, 1)
                      ON CONFLICT (agent_id) DO UPDATE SET active_tickets_count = agent_status.active_tickets_count + 1`,
                     [assignedAgentIdBeforeUpdate]
                 );
                  console.log(`[DEBUG updateTicketStatus] Incremented count for agent ${assignedAgentIdBeforeUpdate} due to reopen`);
             }
        }
        
        await query('COMMIT');
        
        // --- Trigger Assignment if Agent Became Available ---
        if (agentBecameAvailable && assignedAgentIdBeforeUpdate && cityOfTicket) {
             console.log(`[updateTicketStatus] Agent ${assignedAgentIdBeforeUpdate} completed a ticket. Checking for waiting tickets...`);
             const assignmentEngine = new TicketAssignmentEngine();
             assignmentEngine.assignWaitingTicket(assignedAgentIdBeforeUpdate, cityOfTicket)
                 .catch(err => console.error("Error during post-resolution assignment:", err)); 
        }
        
        res.json({ success: true, data: { ticket: updatedTicket } });
        
    } catch (error) {
        try { await query('ROLLBACK'); } catch (rbErr) { console.error('Rollback failed:', rbErr); }
        console.error('Error updating ticket status:', error);
        res.status(500).json({ error: { message: error.message || 'Failed to update ticket status' } });
    }
    // No 'finally' block needed
};

// Add message to ticket
const addTicketMessage = async (req, res) => {
    try {
        const { id: ticketId } = req.params;
        const { message, isInternal = false, attachments } = req.body;
        
        const result = await query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, is_internal, attachments)
             VALUES ($1, $2, 'agent', $3, $4, $5)
             RETURNING id, ticket_id, sender_id, sender_type, message, is_internal, attachments, created_at`,
            [ticketId, req.agent.id, message, isInternal, attachments ? JSON.stringify(attachments) : null]
        );
        
        const newMessage = result.rows[0];
        
        res.status(201).json({
            success: true,
            data: {
                message: {
                    id: newMessage.id,
                    ticketId: newMessage.ticket_id,
                    senderId: newMessage.sender_id,
                    senderName: req.agent.full_name,
                    senderType: newMessage.sender_type,
                    message: newMessage.message,
                    isInternal: newMessage.is_internal,
                    attachments: newMessage.attachments,
                    createdAt: newMessage.created_at
                }
            }
        });
        
    } catch (error) {
        console.error('Error adding ticket message:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to add message',
                timestamp: new Date()
            }
        });
    }
};

const createUserTicket = async (req, res) => {
    try {
        const { userId } = req.user;
        const { subject, description, priority = 'normal' } = req.body;

        // Determine the user's city
        let userCity = null;
        const driverResult = await query('SELECT city FROM drivers WHERE user_id = $1', [userId]);

        if (driverResult.rows.length > 0) {
            userCity = driverResult.rows[0].city;
        } else {
            const rideResult = await query(
                `SELECT d.city
                 FROM rides r
                 JOIN drivers d ON r.driver_id = d.id
                 WHERE r.customer_id = $1
                 ORDER BY r.created_at DESC
                 LIMIT 1`,
                [userId]
            );
            if (rideResult.rows.length > 0) {
                userCity = rideResult.rows[0].city;
            }
        }

        if (!userCity) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Could not determine your city. Please complete a ride to submit a ticket.',
                    timestamp: new Date()
                }
            });
        }

        // Create the ticket
        const result = await query(
            `INSERT INTO support_tickets (customer_id, city, subject, description, priority, status)
             VALUES ($1, $2, $3, $4, $5, 'open')
             RETURNING *`,
            [userId, userCity, subject, description, priority]
        );

        const newTicket = result.rows[0];

        // Attempt to auto-assign the ticket
        const assignmentEngine = new TicketAssignmentEngine();
        await assignmentEngine.assignTicket(newTicket.id, userCity);

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully.',
            data: newTicket
        });

    } catch (error) {
        console.error('Error creating user ticket:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to create ticket.',
                timestamp: new Date()
            }
        });
    }
};

const getUserTickets = async (req, res) => {
    try {
        const { userId } = req.user;

        const result = await query(
            `SELECT st.id, st.subject, st.status, st.priority, st.created_at, ps.full_name as assigned_agent_name
             FROM support_tickets st
             LEFT JOIN platform_staff ps ON st.assigned_agent_id = ps.id
             WHERE st.customer_id = $1
             ORDER BY st.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                tickets: result.rows
            }
        });

    } catch (error) {
        console.error('Error fetching user tickets:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to fetch tickets.',
                timestamp: new Date()
            }
        });
    }
};

/**
 * Escalates a support ticket and frees up the agent's capacity.
 */
const escalateTicket = async (req, res) => {
    const { id: ticketId } = req.params;
    const { reason } = req.body;
    const { userId: agentId, role, city } = req.user;
    
    let assignedAgentIdBeforeUpdate = null;
    let cityOfTicket = null;
    let agentBecameAvailable = false;
    
    try {
        await query('BEGIN');

        // Fetch agent name for the audit log
        const agentResult = await query('SELECT full_name FROM platform_staff WHERE id = $1', [agentId]);
        const agentName = agentResult.rows[0]?.full_name || 'Agent';

        // Get and lock the ticket
        const ticketResult = await query(
            `SELECT id, city, status, escalation_level, assigned_agent_id FROM support_tickets WHERE id = $1 FOR UPDATE`,
            [ticketId]
        );
        if (ticketResult.rows.length === 0) { throw new Error('Ticket not found.'); }
        const ticket = ticketResult.rows[0];
        assignedAgentIdBeforeUpdate = ticket.assigned_agent_id;
        cityOfTicket = ticket.city;

        // --- Authorization & Business Rule Checks ---
        if (role === 'support' && ticket.escalation_level !== 'none') {
            throw new Error('This ticket has already been escalated.');
        }
        if (role === 'city_admin' && ticket.escalation_level !== 'city_admin') {
            throw new Error('This ticket is not at your current escalation level.');
        }
        if (role !== 'central_admin' && ticket.city.toLowerCase() !== city.toLowerCase()) {
            throw new Error('Access denied. You can only escalate tickets in your own city.');
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
            throw new Error('Cannot escalate a resolved or closed ticket.');
        }

        let nextLevel;
        if (role === 'support') nextLevel = 'city_admin';
        else if (role === 'city_admin') nextLevel = 'central_admin';
        else { throw new Error('No higher level to escalate to.'); }
        
        // Step 1: Update the ticket's escalation level
        await query(
            `UPDATE support_tickets SET escalation_level = $1 WHERE id = $2`,
            [nextLevel, ticketId]
        );

        // Step 2: Manually decrement the agent's active ticket count
        if (assignedAgentIdBeforeUpdate) {
            await query(
                `UPDATE agent_status SET active_tickets_count = GREATEST(active_tickets_count - 1, 0) WHERE agent_id = $1`,
                [assignedAgentIdBeforeUpdate]
            );
            agentBecameAvailable = true;
            console.log(`[DEBUG escalateTicket] Decremented count for agent ${assignedAgentIdBeforeUpdate}`);
        }

        // Step 3: Add an internal note for the audit trail
        const escalationMessage = `Ticket escalated to ${nextLevel} by ${agentName}. Reason: ${reason}`;
        await query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, is_internal)
             VALUES ($1, $2, 'agent', $3, true)`,
            [ticketId, agentId, escalationMessage]
        );

        await query('COMMIT');
        
        // --- Trigger Assignment if Agent Became Available ---
        if (agentBecameAvailable && assignedAgentIdBeforeUpdate && cityOfTicket) {
             console.log(`[escalateTicket] Agent ${assignedAgentIdBeforeUpdate} escalated a ticket. Checking for waiting tickets...`);
             const assignmentEngine = new TicketAssignmentEngine();
             assignmentEngine.assignWaitingTicket(assignedAgentIdBeforeUpdate, cityOfTicket)
                 .catch(err => console.error("Error during post-escalation assignment:", err)); 
        }

        res.status(200).json({ message: `Ticket successfully escalated to ${nextLevel}.` });

    } catch (error) {
        try { await query('ROLLBACK'); } catch (rbErr) { console.error('Rollback failed:', rbErr); }
        console.error('Error escalating ticket:', error);
        res.status(500).json({ message: error.message || 'Internal server error.' });
    }
    // No 'finally' block needed
};

module.exports = {
    createTicket,
    getAgentTickets,
    getTicketDetails,
    updateTicketStatus,
    addTicketMessage,
    createUserTicket,
    getUserTickets,
    escalateTicket
};