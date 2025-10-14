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
            `SELECT st.*, u.full_name as customer_name, u.phone_number as customer_phone
             FROM support_tickets st
             LEFT JOIN users u ON st.customer_id = u.id
             ${whereClause}
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

// Update ticket status
const updateTicketStatus = async (req, res) => {
    try {
        const { id: ticketId } = req.params;
        const { status } = req.body;
        
        // Validate status transition
        const validTransitions = {
            'open': ['in_progress'],
            'in_progress': ['pending_customer', 'resolved'],
            'pending_customer': ['in_progress', 'resolved'],
            'resolved': ['closed', 'open'], // Can reopen
            'closed': ['open'] // Can reopen
        };
        
        const currentTicket = req.ticket;
        
        if (!validTransitions[currentTicket.status]?.includes(status)) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: `Invalid status transition from ${currentTicket.status} to ${status}`,
                    timestamp: new Date()
                }
            });
        }
        
        // Update ticket status with appropriate timestamps
        let updateQuery = 'UPDATE support_tickets SET status = $1';
        const params = [status, ticketId];
        
        if (status === 'resolved' && currentTicket.status !== 'resolved') {
            updateQuery += ', resolved_at = NOW()';
        } else if (status === 'closed' && currentTicket.status !== 'closed') {
            updateQuery += ', closed_at = NOW()';
        } else if (status === 'open' && (currentTicket.status === 'resolved' || currentTicket.status === 'closed')) {
            updateQuery += ', resolved_at = NULL, closed_at = NULL';
        }
        
        updateQuery += ' WHERE id = $2 RETURNING *';
        
        const result = await query(updateQuery, params);
        const updatedTicket = result.rows[0];
        
        res.json({
            success: true,
            data: {
                ticket: {
                    id: updatedTicket.id,
                    status: updatedTicket.status,
                    resolvedAt: updatedTicket.resolved_at,
                    closedAt: updatedTicket.closed_at
                }
            }
        });
        
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to update ticket status',
                timestamp: new Date()
            }
        });
    }
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


module.exports = {
    createTicket,
    getAgentTickets,
    getTicketDetails,
    updateTicketStatus,
    addTicketMessage,
    createUserTicket,
    getUserTickets
};