const { query } = require('../db');

// Get tickets available for reassignment
const getReassignmentCandidates = async (req, res) => {
    try {
        const { ticketId } = req.query;
        
        let ticketQuery = `
            SELECT st.id, st.city, st.assigned_agent_id
            FROM support_tickets st
            WHERE st.id = $1
        `;
        
        // Apply city filtering
        if (req.user.role === 'city_admin') {
            ticketQuery += ' AND st.city = $2';
        }
        
        const ticketParams = req.user.role === 'city_admin' 
            ? [ticketId, req.user.city] 
            : [ticketId];
            
        const ticketResult = await query(ticketQuery, ticketParams);
        
        if (ticketResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    type: 'RESOURCE_NOT_FOUND',
                    message: 'Ticket not found or access denied',
                    timestamp: new Date()
                }
            });
        }
        
        const ticket = ticketResult.rows[0];
        
        // Get available agents in the same city
        const agentsQuery = `
            SELECT ps.id, ps.full_name, ps.email, ps.city,
                   ast.status as online_status, ast.active_tickets_count
            FROM platform_staff ps
            LEFT JOIN agent_status ast ON ps.id = ast.agent_id
            WHERE ps.role = 'support' 
            AND ps.city = $1 
            AND ps.status = 'active'
            AND ps.id != COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY ast.active_tickets_count ASC, ps.full_name ASC
        `;
        
        const agentsResult = await query(agentsQuery, [ticket.city, ticket.assigned_agent_id]);
        
        const availableAgents = agentsResult.rows.map(row => ({
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            city: row.city,
            onlineStatus: row.online_status || 'offline',
            activeTicketsCount: row.active_tickets_count || 0,
            canAssign: (row.active_tickets_count || 0) < 2
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
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to fetch reassignment candidates',
                timestamp: new Date()
            }
        });
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
    const { resolution_message } = req.body;
    const { id: adminId, role, city, full_name: adminName } = req.user;

    try {
        await query('BEGIN');

        const ticketResult = await query(
            `SELECT id, city, escalation_level, assigned_agent_id, status FROM support_tickets WHERE id = $1 FOR UPDATE`,
            [ticketId]
        );

        if (ticketResult.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ message: 'Ticket not found.' });
        }
        const ticket = ticketResult.rows[0];

        // --- AUTHORIZATION FIX ---
        // Check for null values before calling .toLowerCase()
        const ticketCity = ticket.city ? ticket.city.toLowerCase() : null;
        const adminCity = city ? city.toLowerCase() : null;

        if (role !== 'central_admin' && ticketCity !== adminCity) {
             await query('ROLLBACK');
             return res.status(403).json({ message: 'Access denied. Ticket is not in your city.' });
        }
        // --- END OF FIX ---

        if (ticket.escalation_level !== role) {
             await query('ROLLBACK');
             return res.status(403).json({ message: 'Access denied. Ticket is not escalated to your level.' });
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
            await query('ROLLBACK');
            return res.status(400).json({ message: 'Ticket is already resolved or closed.' });
        }

        // 1. Update the ticket status
        await query(
            `UPDATE support_tickets SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
            [ticketId]
        );

        // 2. Add the admin's resolution note
        const finalMessage = `Ticket resolved by ${adminName} (${role}). Note: ${resolution_message}`;
        await query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, is_internal)
             VALUES ($1, $2, 'agent', $3, true)`,
            [ticketId, adminId, finalMessage]
        );

        await query('COMMIT');

        res.status(200).json({ success: true, message: `Ticket successfully resolved.` });

    } catch (error) {
        try {
            await query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Failed to rollback transaction:', rollbackError);
        }
        console.error('Error in adminResolveTicket:', error);
        res.status(500).json({ message: error.message || 'Internal server error.' });
    }
};


// --- 3. REPLACED FUNCTION: Admin Re-assigns the Ticket ---
const reassignTicket = async (req, res) => {
    const { id: ticketId } = req.params;
    const { agentId: targetAgentId, reason } = req.body; // The agent to assign to
    const { id: adminId, role, city, full_name: adminName } = req.user;

    const client = await dbService.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Get and Lock the ticket
        const ticketResult = await client.query(
            `SELECT id, city, escalation_level, assigned_agent_id, status FROM support_tickets WHERE id = $1 FOR UPDATE`,
            [ticketId]
        );
        if (ticketResult.rows.length === 0) { throw new Error('Ticket not found'); }
        const ticket = ticketResult.rows[0];

        // 2. Authorization
        if (role !== 'central_admin' && LOWER(ticket.city) !== LOWER(city)) {
             throw new Error('Access denied. Ticket is not in your city.');
        }
        if (ticket.escalation_level !== role) {
             throw new Error('Access denied. Ticket is not escalated to your level.');
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
            throw new Error('Cannot re-assign a resolved or closed ticket.');
        }
        if (ticket.assigned_agent_id === targetAgentId) {
            throw new Error('This ticket is already assigned to this agent.');
        }

        // 3. Get and Lock the TARGET agent's status
        const capacityCheck = await client.query(
            'SELECT COALESCE(active_tickets_count, 0) as count FROM agent_status WHERE agent_id = $1 FOR UPDATE',
            [targetAgentId]
        );
        
        const currentCount = capacityCheck.rows[0]?.count || 0;
        if (currentCount >= 2) { // Assuming maxTicketsPerAgent = 2
            throw new Error('Target agent is at maximum ticket capacity.');
        }

        // 4. Update the ticket: set new agent, reset escalation, set status
        await client.query(
            `UPDATE support_tickets 
             SET 
                assigned_agent_id = $1, 
                assigned_at = NOW(),
                escalation_level = 'none', 
                status = 'in_progress'
             WHERE id = $2`,
            [targetAgentId, ticketId]
        );
        
        // 5. Increment the NEW agent's count (UPSERT logic)
        await client.query(
            `INSERT INTO agent_status (agent_id, active_tickets_count) VALUES ($1, 1)
             ON CONFLICT (agent_id) DO UPDATE
             SET active_tickets_count = agent_status.active_tickets_count + 1`,
            [targetAgentId]
        );
        
        // 6. Add admin's note to history
        const reassignMessage = `Ticket re-assigned to agent by ${adminName} (${role}). Note: ${reason}`;
        await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, is_internal)
             VALUES ($1, $2, 'agent', $3, true)`,
            [ticketId, adminId, reassignMessage]
        );
        
        // 7. Log the new assignment in history
        await client.query(
            `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_type)
             VALUES ($1, $2, $3, 'manual')`,
            [ticketId, targetAgentId, adminId]
        );

        await client.query('COMMIT');
        
        // 8. TODO: Notify the target agent via WebSocket
        
        res.status(200).json({ message: `Ticket successfully re-assigned.` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in reassignTicket:', error);
        res.status(500).json({ message: error.message || 'Internal server error.' });
    } finally {
        client.release();
    }
};

module.exports = {
   getReassignmentCandidates,
    reassignTicket,
    getEscalatedQueue,
    adminResolveTicket
};