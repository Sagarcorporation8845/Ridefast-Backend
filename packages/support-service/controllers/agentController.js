const { query } = require('../db');
const TicketAssignmentEngine = require('../services/TicketAssignmentEngine');

// Update agent online/offline status
const updateAgentStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const agentId = req.agent.id;
        
        // Validate status
        if (!['online', 'offline', 'busy'].includes(status)) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Invalid status. Must be online, offline, or busy',
                    timestamp: new Date()
                }
            });
        }
        
        // If going offline, check if agent has active tickets
        if (status === 'offline') {
            const activeTicketsResult = await query(
                `SELECT COUNT(*) as count 
                 FROM support_tickets 
                 WHERE assigned_agent_id = $1 
                 AND status NOT IN ('resolved', 'closed')`,
                [agentId]
            );
            
            const activeCount = parseInt(activeTicketsResult.rows[0].count);
            
            if (activeCount > 0) {
                return res.status(400).json({
                    error: {
                        type: 'VALIDATION_ERROR',
                        message: `Cannot go offline with ${activeCount} active ticket(s). Please complete or reassign them first.`,
                        timestamp: new Date()
                    }
                });
            }
        }
        
        // Update agent status
        const result = await query(
            `INSERT INTO agent_status (agent_id, status, last_activity, updated_at)
             VALUES ($1, $2, NOW(), NOW())
             ON CONFLICT (agent_id) 
             DO UPDATE SET 
                status = EXCLUDED.status,
                last_activity = EXCLUDED.last_activity,
                updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [agentId, status]
        );
        
        const updatedStatus = result.rows[0];
        
        // Handle agent going offline - try to reassign their tickets
        if (status === 'offline') {
            const assignmentEngine = new TicketAssignmentEngine();
            await assignmentEngine.handleAgentOffline(agentId);
        }
        
        res.json({
            success: true,
            data: {
                agentStatus: {
                    agentId: updatedStatus.agent_id,
                    status: updatedStatus.status,
                    activeTicketsCount: updatedStatus.active_tickets_count,
                    lastActivity: updatedStatus.last_activity,
                    updatedAt: updatedStatus.updated_at
                }
            }
        });
        
    } catch (error) {
        console.error('Error updating agent status:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to update agent status',
                timestamp: new Date()
            }
        });
    }
};

// Get agent's current workload
const getAgentWorkload = async (req, res) => {
    try {
        const agentId = req.agent.id;
        
        // Get agent status
        const statusResult = await query(
            'SELECT * FROM agent_status WHERE agent_id = $1',
            [agentId]
        );
        
        const agentStatus = statusResult.rows[0] || {
            agent_id: agentId,
            status: 'offline',
            active_tickets_count: 0,
            last_activity: null,
            updated_at: null
        };
        
        // Get detailed ticket breakdown
        const ticketsResult = await query(
            `SELECT 
                status,
                priority,
                COUNT(*) as count
             FROM support_tickets 
             WHERE assigned_agent_id = $1 
             AND status NOT IN ('resolved', 'closed')
             GROUP BY status, priority
             ORDER BY 
                CASE priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'normal' THEN 3 
                    WHEN 'low' THEN 4 
                END`,
            [agentId]
        );
        
        // Get recent activity
        const recentTicketsResult = await query(
            `SELECT st.id, st.subject, st.priority, st.status, st.created_at, u.full_name as customer_name
             FROM support_tickets st
             LEFT JOIN users u ON st.customer_id = u.id
             WHERE st.assigned_agent_id = $1 
             AND st.status NOT IN ('resolved', 'closed')
             ORDER BY 
                CASE st.priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'normal' THEN 3 
                    WHEN 'low' THEN 4 
                END,
                st.created_at ASC
             LIMIT 10`,
            [agentId]
        );
        
        const ticketBreakdown = ticketsResult.rows.reduce((acc, row) => {
            if (!acc[row.status]) {
                acc[row.status] = {};
            }
            acc[row.status][row.priority] = parseInt(row.count);
            return acc;
        }, {});
        
        const recentTickets = recentTicketsResult.rows.map(row => ({
            id: row.id,
            subject: row.subject,
            priority: row.priority,
            status: row.status,
            customerName: row.customer_name,
            createdAt: row.created_at
        }));
        
        res.json({
            success: true,
            data: {
                agentStatus: {
                    agentId: agentStatus.agent_id,
                    status: agentStatus.status,
                    activeTicketsCount: agentStatus.active_tickets_count,
                    lastActivity: agentStatus.last_activity,
                    updatedAt: agentStatus.updated_at
                },
                workload: {
                    totalActiveTickets: agentStatus.active_tickets_count,
                    maxCapacity: 2,
                    availableSlots: Math.max(0, 2 - agentStatus.active_tickets_count),
                    ticketBreakdown,
                    recentTickets
                }
            }
        });
        
    } catch (error) {
        console.error('Error fetching agent workload:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to fetch workload information',
                timestamp: new Date()
            }
        });
    }
};

module.exports = {
    updateAgentStatus,
    getAgentWorkload
};