const { query } = require('../db');

// Get tickets available for reassignment
const getReassignmentCandidates = async (req, res) => {
    try {
        const { ticketId } = req.query;
        
        if (!ticketId) {
            return res.status(400).json({ error: { type: 'VALIDATION_ERROR', message: 'ticketId is required.' }});
        }
        
        // --- Get Ticket Details ---
        let ticketQuery = `
            SELECT st.id, st.city, st.assigned_agent_id
            FROM support_tickets st
            WHERE st.id = $1
        `;
        
        const ticketParams = [ticketId];
        
        if (req.user.role === 'city_admin') {
            ticketQuery += ' AND LOWER(st.city) = LOWER($2)';
            ticketParams.push(req.user.city);
        }
            
        const ticketResult = await query(ticketQuery, ticketParams);
        
        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ /*... Ticket not found error ...*/ });
        }
        
        const ticket = ticketResult.rows[0];

        // --- THIS QUERY IS NOW ENHANCED ---
        const agentsQuery = `
            SELECT 
                ps.id, 
                ps.full_name, 
                ps.email, 
                ps.city,
                COALESCE(ast.status, 'offline') as online_status, 
                COALESCE(ast.active_tickets_count, 0) as active_tickets_count,
                (COALESCE(ast.active_tickets_count, 0) < 2) as can_assign_immediately,
                
                -- This new subquery counts queued tickets for each agent
                COALESCE(q_counts.queued_count, 0) as queued_tickets_count

            FROM platform_staff ps
            
            LEFT JOIN agent_status ast ON ps.id = ast.agent_id
            
            -- New join to a subquery that counts queued tickets
            LEFT JOIN (
                SELECT
                    queued_for_agent_id,
                    COUNT(id) as queued_count
                FROM support_tickets
                WHERE
                    status = 'open' AND queued_for_agent_id IS NOT NULL
                GROUP BY queued_for_agent_id
            ) q_counts ON ps.id = q_counts.queued_for_agent_id

            WHERE 
                ps.role = 'support'
                AND ps.status = 'active'
                AND LOWER(TRIM(ps.city)) = LOWER(TRIM($1))
                AND ps.id != COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid) 
            
            ORDER BY
                CASE WHEN COALESCE(ast.status, 'offline') = 'online' THEN 1 ELSE 2 END ASC,
                active_tickets_count ASC, 
                queued_tickets_count ASC, -- Also sort by who has the smallest queue
                ps.full_name ASC
        `;
        // --- END OF MODIFIED QUERY ---
        
        const agentsResult = await query(agentsQuery, [ticket.city, ticket.assigned_agent_id]);
        
        const availableAgents = agentsResult.rows.map(row => ({
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            city: row.city,
            onlineStatus: row.online_status,
            activeTicketsCount: parseInt(row.active_tickets_count, 10),
            canAssignImmediately: row.can_assign_immediately,
            // --- NEW FIELD ADDED TO RESPONSE ---
            queuedTicketsCount: parseInt(row.queued_tickets_count, 10) 
        }));
        
        res.json({
            success: true,
            data: {
                ticket: {
                    id: ticket.id,
                    city: ticket.city,
                    currentAgentId: ticket.assigned_agent_id
                },
                availableAgents
            }
        });
        
    } catch (error) {
        console.error('Error fetching reassignment candidates:', error);
        res.status(500).json({ /*... Database error ...*/ });
    }
};

// --- 1. NEW FUNCTION: Get the Escalated Queue ---
const getEscalatedQueue = async (req, res) => {
    const { role, city } = req.user; // Get admin's role and city from token

    try {
        let whereClause = `WHERE st.escalation_level = $1 AND st.status NOT IN ('resolved', 'closed')`;
        const params = [role]; // e.g., 'city_admin' or 'central_admin'

        // A city_admin can only see their city's escalated tickets
        if (role === 'city_admin') {
            whereClause += ` AND LOWER(st.city) = LOWER($2)`;
            params.push(city);
        }
        // A central_admin sees all tickets at their level (no city filter)

        const { rows } = await query(`
            SELECT 
                st.id, 
                st.subject, 
                st.city, 
                st.status, 
                st.priority, 
                st.escalation_level,
                st.created_at,
                u.full_name as customer_name
            FROM support_tickets st
            JOIN users u ON st.customer_id = u.id
            ${whereClause}
            ORDER BY st.created_at ASC
        `, params);

        res.json({ success: true, data: { tickets: rows } });

    } catch (error) {
        console.error('Error fetching escalated queue:', error);
        res.status(500).json({ message: 'Error fetching escalated tickets.' });
    }
};

/**
 * Allows an admin to resolve or close an escalated ticket.
 * (Corrected to use JavaScript's .toLowerCase())
 */
const adminResolveTicket = async (req, res) => {
    const { id: ticketId } = req.params;
    const { resolution_message, status } = req.body;
    const { id: adminId, role, city, full_name: adminName } = req.user;

    try {
        await query('BEGIN');

        const ticketResult = await query(
            `SELECT id, city, escalation_level, assigned_agent_id, status FROM support_tickets WHERE id = $1 FOR UPDATE`,
            [ticketId]
        );
        if (ticketResult.rows.length === 0) { throw new Error('Ticket not found'); }
        const ticket = ticketResult.rows[0];

        // --- Authorization ---
        const ticketCity = ticket.city ? ticket.city.toLowerCase() : null;
        const adminCity = city ? city.toLowerCase() : null;

        if (role !== 'central_admin' && ticketCity !== adminCity) {
             throw new Error('Access denied. Ticket is not in your city.');
        }
        if (ticket.escalation_level !== role) {
             throw new Error('Access denied. Ticket is not escalated to your level.');
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
            throw new Error('Ticket is already resolved or closed.');
        }

        // 1. Update the ticket status
        await query(
            `UPDATE support_tickets SET status = $1, resolved_at = NOW() WHERE id = $2`,
            [status, ticketId]
        );

        // 2. Add the admin's resolution note
        const finalMessage = `Ticket resolved by ${adminName} (${role}). Note: ${resolution_message}`;
        await query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, is_internal)
             VALUES ($1, $2, 'agent', $3, true)`,
            [ticketId, adminId, finalMessage]
        );
        
        // Note: We don't adjust agent count because escalation already did.
        await query('COMMIT');
        res.status(200).json({ success: true, message: `Ticket successfully ${status}.` });

    } catch (error) {
        try { await query('ROLLBACK'); } catch (rbErr) { console.error('Rollback failed:', rbErr); }
        console.error('Error in adminResolveTicket:', error);
        res.status(500).json({ message: error.message || 'Internal server error.' });
    }
};

/**
 * Allows an admin to re-assign an escalated ticket to a support agent.
 * If the agent is at capacity, the ticket will be queued for them.
 */
const reassignTicket = async (req, res) => {
    const { id: ticketId } = req.params;
    const { agentId: targetAgentId, reason } = req.body; 
    const { id: adminId, role, city, full_name: adminName } = req.user;
    
    try {
        await query('BEGIN'); // Start transaction

        // 1. Get and Lock the ticket
        const ticketResult = await query(
            `SELECT id, city, escalation_level, assigned_agent_id, status FROM support_tickets WHERE id = $1 FOR UPDATE`,
            [ticketId]
        );
        if (ticketResult.rows.length === 0) { throw new Error('Ticket not found'); }
        const ticket = ticketResult.rows[0];

        // 2. Authorization
        const ticketCity = ticket.city ? ticket.city.toLowerCase() : null;
        const adminCity = city ? city.toLowerCase() : null;
        if (role !== 'central_admin' && ticketCity !== adminCity) {
             throw new Error('Access denied. Ticket is not in your city.');
        }
        if (ticket.escalation_level !== role) {
             throw new Error('Access denied. Ticket is not escalated to your level.');
        }
        // ... (other authorization checks as needed) ...

        // 3. Get and Lock the TARGET agent's status
        const capacityCheck = await query(
            'SELECT COALESCE(active_tickets_count, 0) as count FROM agent_status WHERE agent_id = $1 FOR UPDATE',
            [targetAgentId]
        );
        
        const currentCount = capacityCheck.rows[0]?.count || 0;
        const maxCapacity = 2; // Your max capacity
        const reassignMessage = `Ticket re-assigned by ${adminName} (${role}). Note: ${reason}`;
        let responseMessage = '';

        // 4. Check Agent Capacity and Decide: Assign Now or Queue?
        if (currentCount < maxCapacity) {
            // --- SCENARIO A: AGENT IS AVAILABLE - ASSIGN NOW ---
            console.log(`[adminReassign] Agent ${targetAgentId} has capacity. Assigning immediately.`);
            await query(
                `UPDATE support_tickets SET 
                    assigned_agent_id = $1, assigned_at = NOW(),
                    escalation_level = 'none', status = 'in_progress',
                    queued_for_agent_id = NULL
                 WHERE id = $2`,
                [targetAgentId, ticketId]
            );
            
            // Increment the NEW agent's count (UPSERT)
            await query(
                `INSERT INTO agent_status (agent_id, active_tickets_count) VALUES ($1, 1)
                 ON CONFLICT (agent_id) DO UPDATE
                 SET active_tickets_count = agent_status.active_tickets_count + 1`,
                [targetAgentId]
            );
            
            await query(
                `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_type)
                 VALUES ($1, $2, $3, 'manual')`,
                [ticketId, targetAgentId, adminId]
            );
            responseMessage = 'Ticket successfully re-assigned to agent.';

        } else {
            // --- SCENARIO B: AGENT IS FULL - QUEUE THE TICKET ---
            console.log(`[adminReassign] Agent ${targetAgentId} is at capacity. Queuing ticket.`);
            await query(
                `UPDATE support_tickets 
                 SET 
                    queued_for_agent_id = $1,
                    escalation_level = 'none', 
                    status = 'open',
                    assigned_agent_id = NULL,
                    assigned_at = NULL
                 WHERE id = $2`,
                [targetAgentId, ticketId]
            );
            responseMessage = 'Agent is at capacity. Ticket has been queued and will be assigned to them next.';
        }
        
        // 5. Add admin's note to history
        await query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, is_internal)
             VALUES ($1, $2, 'agent', $3, true)`,
            [ticketId, adminId, reassignMessage]
        );

        await query('COMMIT');
        res.status(200).json({ success: true, message: responseMessage });

    } catch (error) {
        try { await query('ROLLBACK'); } catch (rbErr) { console.error('Rollback failed:', rbErr); }
        console.error('Error in reassignTicket:', error);
        res.status(500).json({ message: error.message || 'Internal server error.' });
    }
};

module.exports = {
   getReassignmentCandidates,
    reassignTicket,
    getEscalatedQueue,
    adminResolveTicket
};