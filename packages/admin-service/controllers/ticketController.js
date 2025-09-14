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

// Manually reassign ticket
const reassignTicket = async (req, res) => {
    
    try {
        const { id: ticketId } = req.params;
        const { agentId, reason } = req.body;
        
        // Verify ticket exists and user has permission
        let ticketQuery = `
            SELECT st.id, st.city, st.assigned_agent_id, st.status
            FROM support_tickets st
            WHERE st.id = $1
        `;
        
        const ticketParams = [ticketId];
        
        if (req.user.role === 'city_admin') {
            ticketQuery += ' AND st.city = $2';
            ticketParams.push(req.user.city);
        }
        
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
        
        // Verify new agent exists and is in same city
        const agentResult = await query(
            `SELECT id, city, full_name FROM platform_staff 
             WHERE id = $1 AND role = 'support' AND city = $2 AND status = 'active'`,
            [agentId, ticket.city]
        );
        
        if (agentResult.rows.length === 0) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Invalid agent or agent not in same city',
                    timestamp: new Date()
                }
            });
        }
        
        const newAgent = agentResult.rows[0];
        
        // Check if new agent has capacity (less than 2 active tickets)
        const capacityResult = await query(
            'SELECT active_tickets_count FROM agent_status WHERE agent_id = $1',
            [agentId]
        );
        
        const currentCount = capacityResult.rows[0]?.active_tickets_count || 0;
        if (currentCount >= 2) {
            return res.status(400).json({
                error: {
                    type: 'ASSIGNMENT_ERROR',
                    message: 'Agent has reached maximum ticket capacity',
                    timestamp: new Date()
                }
            });
        }
        
        // Update ticket assignment
        await query(
            `UPDATE support_tickets 
             SET assigned_agent_id = $1, assigned_at = NOW(), status = CASE 
                 WHEN status = 'open' THEN 'in_progress' 
                 ELSE status 
             END
             WHERE id = $2`,
            [agentId, ticketId]
        );
        
        // Record new assignment history
        await query(
            `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_type)
             VALUES ($1, $2, $3, 'manual')`,
            [ticketId, agentId, req.user.id]
        );
        
        res.json({
            success: true,
            data: {
                message: 'Ticket reassigned successfully',
                ticket: {
                    id: ticketId,
                    newAgentId: agentId,
                    newAgentName: newAgent.full_name,
                    reassignedBy: req.user.full_name,
                    reason: reason || null
                }
            }
        });
        
    } catch (error) {
        console.error('Error reassigning ticket:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to reassign ticket',
                timestamp: new Date()
            }
        });
    }
};

module.exports = {
    getReassignmentCandidates,
    reassignTicket
};