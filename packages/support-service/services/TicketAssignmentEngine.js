const { query } = require('../db');

class TicketAssignmentEngine {
    constructor() {
        this.maxTicketsPerAgent = 2;
    }

    /**
     * Automatically assign a ticket to an available agent
     * @param {string} ticketId - The ticket ID to assign
     * @param {string} city - The city where the ticket was created
     * @returns {Promise<string|null>} - Returns assigned agent ID or null if no assignment possible
     */
    async assignTicket(ticketId, city) {
        try {
            console.log(`[TicketAssignmentEngine] Attempting to assign ticket ${ticketId} in city ${city}`);
            
            const availableAgents = await this.getAvailableAgents(city);
            
            if (availableAgents.length === 0) {
                console.log(`[TicketAssignmentEngine] No available agents in city ${city}`);
                await this.alertCityAdmin(city, 'no_agents_available', { ticketId });
                return null;
            }
            
            // Find agent with lowest workload
            const selectedAgent = availableAgents.reduce((min, agent) => 
                agent.active_tickets_count < min.active_tickets_count ? agent : min
            );
            
            if (selectedAgent.active_tickets_count >= this.maxTicketsPerAgent) {
                console.log(`[TicketAssignmentEngine] All agents at capacity in city ${city}`);
                await this.alertCityAdmin(city, 'agents_at_capacity', { ticketId });
                return null;
            }
            
            const assignedAgentId = await this.assignToAgent(ticketId, selectedAgent.id);
            
            if (assignedAgentId) {
                console.log(`[TicketAssignmentEngine] Successfully assigned ticket ${ticketId} to agent ${assignedAgentId}`);
                // TODO: Send real-time notification to agent via WebSocket
                await this.notifyAgent(assignedAgentId, ticketId);
            }
            
            return assignedAgentId;
            
        } catch (error) {
            console.error(`[TicketAssignmentEngine] Error assigning ticket ${ticketId}:`, error);
            return null;
        }
    }

    /**
     * Get available agents in a specific city
     * @param {string} city - The city to search for agents
     * @returns {Promise<Array>} - Array of available agents
     */
    async getAvailableAgents(city) {
        try {
            const result = await query(`
                SELECT ps.id, ps.full_name, ps.email, ps.city, 
                       COALESCE(ast.active_tickets_count, 0) as active_tickets_count,
                       COALESCE(ast.status, 'offline') as online_status
                FROM platform_staff ps
                LEFT JOIN agent_status ast ON ps.id = ast.agent_id
                WHERE ps.city = $1 
                AND ps.role = 'support' 
                AND ps.status = 'active'
                AND COALESCE(ast.status, 'offline') = 'online'
                AND COALESCE(ast.active_tickets_count, 0) < $2
                ORDER BY COALESCE(ast.active_tickets_count, 0) ASC, ps.full_name ASC
            `, [city, this.maxTicketsPerAgent]);
            
            return result.rows;
        } catch (error) {
            console.error('[TicketAssignmentEngine] Error fetching available agents:', error);
            return [];
        }
    }

    /**
     * Assign a ticket to a specific agent
     * @param {string} ticketId - The ticket ID
     * @param {string} agentId - The agent ID
     * @returns {Promise<string|null>} - Returns agent ID if successful, null otherwise
     */
    async assignToAgent(ticketId, agentId) {
        const client = await require('../db').query('SELECT 1'); // Get a client from pool
        
        try {
            // Start transaction
            await query('BEGIN');
            
            // Double-check agent capacity
            const capacityCheck = await query(
                'SELECT COALESCE(active_tickets_count, 0) as count FROM agent_status WHERE agent_id = $1',
                [agentId]
            );
            
            const currentCount = capacityCheck.rows[0]?.count || 0;
            if (currentCount >= this.maxTicketsPerAgent) {
                await query('ROLLBACK');
                console.log(`[TicketAssignmentEngine] Agent ${agentId} at capacity during assignment`);
                return null;
            }
            
            // Update ticket assignment
            const ticketUpdate = await query(
                `UPDATE support_tickets 
                 SET assigned_agent_id = $1, assigned_at = NOW(), 
                     status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
                 WHERE id = $2 AND assigned_agent_id IS NULL
                 RETURNING id, assigned_agent_id`,
                [agentId, ticketId]
            );
            
            if (ticketUpdate.rows.length === 0) {
                await query('ROLLBACK');
                console.log(`[TicketAssignmentEngine] Ticket ${ticketId} already assigned or not found`);
                return null;
            }
            
            // Record assignment history
            await query(
                `INSERT INTO ticket_assignments (ticket_id, agent_id, assignment_type)
                 VALUES ($1, $2, 'automatic')`,
                [ticketId, agentId]
            );
            
            // The trigger will automatically update agent_status.active_tickets_count
            
            await query('COMMIT');
            return agentId;
            
        } catch (error) {
            await query('ROLLBACK');
            console.error('[TicketAssignmentEngine] Error in assignToAgent:', error);
            return null;
        }
    }

    /**
     * Reassign a ticket from one agent to another
     * @param {string} ticketId - The ticket ID
     * @param {string} fromAgentId - Current agent ID (can be null)
     * @param {string} toAgentId - New agent ID
     * @param {string} reassignedBy - ID of user performing reassignment
     * @returns {Promise<boolean>} - Success status
     */
    async reassignTicket(ticketId, fromAgentId, toAgentId, reassignedBy) {
        try {
            await query('BEGIN');
            
            // Check target agent capacity
            const capacityCheck = await query(
                'SELECT COALESCE(active_tickets_count, 0) as count FROM agent_status WHERE agent_id = $1',
                [toAgentId]
            );
            
            const currentCount = capacityCheck.rows[0]?.count || 0;
            if (currentCount >= this.maxTicketsPerAgent) {
                await query('ROLLBACK');
                return false;
            }
            
            // Update old assignment record
            if (fromAgentId) {
                await query(
                    `UPDATE ticket_assignments 
                     SET unassigned_at = NOW() 
                     WHERE ticket_id = $1 AND agent_id = $2 AND unassigned_at IS NULL`,
                    [ticketId, fromAgentId]
                );
            }
            
            // Update ticket
            await query(
                `UPDATE support_tickets 
                 SET assigned_agent_id = $1, assigned_at = NOW()
                 WHERE id = $2`,
                [toAgentId, ticketId]
            );
            
            // Create new assignment record
            await query(
                `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_type)
                 VALUES ($1, $2, $3, 'manual')`,
                [ticketId, toAgentId, reassignedBy]
            );
            
            await query('COMMIT');
            
            // Notify both agents
            if (fromAgentId) {
                await this.notifyAgent(fromAgentId, ticketId, 'ticket_unassigned');
            }
            await this.notifyAgent(toAgentId, ticketId, 'ticket_assigned');
            
            return true;
            
        } catch (error) {
            await query('ROLLBACK');
            console.error('[TicketAssignmentEngine] Error in reassignTicket:', error);
            return false;
        }
    }

    /**
     * Handle agent going offline - reassign their tickets if needed
     * @param {string} agentId - The agent going offline
     * @returns {Promise<void>}
     */
    async handleAgentOffline(agentId) {
        try {
            // Get agent's active tickets
            const activeTickets = await query(
                `SELECT id, city FROM support_tickets 
                 WHERE assigned_agent_id = $1 
                 AND status NOT IN ('resolved', 'closed')`,
                [agentId]
            );
            
            if (activeTickets.rows.length > 0) {
                console.log(`[TicketAssignmentEngine] Agent ${agentId} going offline with ${activeTickets.rows.length} active tickets`);
                
                // Try to reassign each ticket
                for (const ticket of activeTickets.rows) {
                    const reassigned = await this.assignTicket(ticket.id, ticket.city);
                    if (!reassigned) {
                        console.log(`[TicketAssignmentEngine] Could not reassign ticket ${ticket.id} from offline agent ${agentId}`);
                        await this.alertCityAdmin(ticket.city, 'reassignment_failed', { 
                            ticketId: ticket.id, 
                            offlineAgentId: agentId 
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[TicketAssignmentEngine] Error handling agent offline:', error);
        }
    }

    /**
     * Send alert to city admin
     * @param {string} city - The city
     * @param {string} alertType - Type of alert
     * @param {Object} data - Additional alert data
     * @returns {Promise<void>}
     */
    async alertCityAdmin(city, alertType, data = {}) {
        try {
            // Get city admin(s)
            const cityAdmins = await query(
                `SELECT id, full_name, email FROM platform_staff 
                 WHERE city = $1 AND role = 'city_admin' AND status = 'active'`,
                [city]
            );
            
            const alertMessage = this.getAlertMessage(alertType, data);
            
            for (const admin of cityAdmins.rows) {
                console.log(`[TicketAssignmentEngine] Alerting city admin ${admin.id} in ${city}: ${alertMessage}`);
                // TODO: Send real-time notification via WebSocket
                // TODO: Optionally send email notification
                await this.notifyAdmin(admin.id, alertType, alertMessage, data);
            }
            
        } catch (error) {
            console.error('[TicketAssignmentEngine] Error alerting city admin:', error);
        }
    }

    /**
     * Get alert message based on type
     * @param {string} alertType - Type of alert
     * @param {Object} data - Alert data
     * @returns {string} - Alert message
     */
    getAlertMessage(alertType, data) {
        switch (alertType) {
            case 'no_agents_available':
                return `No support agents available for ticket ${data.ticketId}. Please assign manually or bring agents online.`;
            case 'agents_at_capacity':
                return `All support agents at maximum capacity for ticket ${data.ticketId}. Consider adding more agents or reassigning existing tickets.`;
            case 'reassignment_failed':
                return `Failed to reassign ticket ${data.ticketId} from offline agent ${data.offlineAgentId}. Manual intervention required.`;
            default:
                return `Support system alert: ${alertType}`;
        }
    }

    /**
     * Notify agent via WebSocket (placeholder for future implementation)
     * @param {string} agentId - Agent ID
     * @param {string} ticketId - Ticket ID
     * @param {string} eventType - Event type
     * @returns {Promise<void>}
     */
    async notifyAgent(agentId, ticketId, eventType = 'ticket_assigned') {
        // TODO: Implement WebSocket notification
        console.log(`[TicketAssignmentEngine] TODO: Notify agent ${agentId} about ${eventType} for ticket ${ticketId}`);
    }

    /**
     * Notify admin via WebSocket (placeholder for future implementation)
     * @param {string} adminId - Admin ID
     * @param {string} alertType - Alert type
     * @param {string} message - Alert message
     * @param {Object} data - Additional data
     * @returns {Promise<void>}
     */
    async notifyAdmin(adminId, alertType, message, data) {
        // TODO: Implement WebSocket notification
        console.log(`[TicketAssignmentEngine] TODO: Notify admin ${adminId} about ${alertType}: ${message}`);
    }

    /**
     * Assign unassigned tickets when an agent comes online
     * @param {string} agentId - The agent who came online
     * @param {string} city - The city of the agent
     * @returns {Promise<number>} - Number of tickets assigned
     */
    async assignUnassignedTickets(agentId, city) {
        try {
            console.log(`[TicketAssignmentEngine] Agent ${agentId} came online in ${city}, checking for unassigned tickets`);
            
            // Get unassigned tickets in the same city, ordered by priority and creation time
            const unassignedTickets = await query(`
                SELECT st.id, st.subject, st.priority, st.created_at
                FROM support_tickets st
                WHERE st.city = $1 
                AND st.assigned_agent_id IS NULL 
                AND st.status IN ('open', 'in_progress')
                ORDER BY 
                    CASE st.priority 
                        WHEN 'urgent' THEN 1 
                        WHEN 'high' THEN 2 
                        WHEN 'normal' THEN 3 
                        WHEN 'low' THEN 4 
                    END,
                    st.created_at ASC
                LIMIT $2
            `, [city, this.maxTicketsPerAgent]);
            
            if (unassignedTickets.rows.length === 0) {
                console.log(`[TicketAssignmentEngine] No unassigned tickets found in ${city}`);
                return 0;
            }
            
            let assignedCount = 0;
            
            for (const ticket of unassignedTickets.rows) {
                // Check if agent still has capacity
                const agentStatus = await query(
                    'SELECT COALESCE(active_tickets_count, 0) as count FROM agent_status WHERE agent_id = $1',
                    [agentId]
                );
                
                const currentCount = agentStatus.rows[0]?.count || 0;
                if (currentCount >= this.maxTicketsPerAgent) {
                    console.log(`[TicketAssignmentEngine] Agent ${agentId} at capacity, stopping assignment`);
                    break;
                }
                
                // Assign the ticket
                const assigned = await this.assignToAgent(ticket.id, agentId);
                if (assigned) {
                    assignedCount++;
                    console.log(`[TicketAssignmentEngine] Assigned unassigned ticket ${ticket.id} to agent ${agentId}`);
                    await this.notifyAgent(agentId, ticket.id);
                }
            }
            
            console.log(`[TicketAssignmentEngine] Assigned ${assignedCount} unassigned tickets to agent ${agentId}`);
            return assignedCount;
            
        } catch (error) {
            console.error(`[TicketAssignmentEngine] Error assigning unassigned tickets to agent ${agentId}:`, error);
            return 0;
        }
    }

    /**
     * Manually assign all unassigned tickets in a city to available agents
     * @param {string} city - The city to process
     * @returns {Promise<Object>} - Assignment results
     */
    async assignAllUnassignedTickets(city) {
        try {
            console.log(`[TicketAssignmentEngine] Manual assignment requested for unassigned tickets in ${city}`);
            
            // Get all unassigned tickets in the city
            const unassignedTickets = await query(`
                SELECT st.id, st.subject, st.priority, st.created_at
                FROM support_tickets st
                WHERE st.city = $1 
                AND st.assigned_agent_id IS NULL 
                AND st.status IN ('open', 'in_progress')
                ORDER BY 
                    CASE st.priority 
                        WHEN 'urgent' THEN 1 
                        WHEN 'high' THEN 2 
                        WHEN 'normal' THEN 3 
                        WHEN 'low' THEN 4 
                    END,
                    st.created_at ASC
            `, [city]);
            
            if (unassignedTickets.rows.length === 0) {
                return {
                    success: true,
                    message: 'No unassigned tickets found',
                    assignedCount: 0,
                    tickets: []
                };
            }
            
            const results = {
                success: true,
                message: `Processed ${unassignedTickets.rows.length} unassigned tickets`,
                assignedCount: 0,
                unassignedCount: 0,
                tickets: []
            };
            
            for (const ticket of unassignedTickets.rows) {
                const assignedAgentId = await this.assignTicket(ticket.id, city);
                
                if (assignedAgentId) {
                    results.assignedCount++;
                    results.tickets.push({
                        ticketId: ticket.id,
                        subject: ticket.subject,
                        priority: ticket.priority,
                        assignedAgentId: assignedAgentId,
                        status: 'assigned'
                    });
                } else {
                    results.unassignedCount++;
                    results.tickets.push({
                        ticketId: ticket.id,
                        subject: ticket.subject,
                        priority: ticket.priority,
                        assignedAgentId: null,
                        status: 'unassigned'
                    });
                }
            }
            
            console.log(`[TicketAssignmentEngine] Manual assignment completed: ${results.assignedCount} assigned, ${results.unassignedCount} unassigned`);
            return results;
            
        } catch (error) {
            console.error(`[TicketAssignmentEngine] Error in manual assignment for ${city}:`, error);
            return {
                success: false,
                message: 'Failed to process unassigned tickets',
                error: error.message,
                assignedCount: 0,
                unassignedCount: 0,
                tickets: []
            };
        }
    }

    /**
     * Get assignment statistics for monitoring
     * @param {string} city - City to get stats for (optional)
     * @returns {Promise<Object>} - Assignment statistics
     */
    async getAssignmentStats(city = null) {
        try {
            let whereClause = '';
            const params = [];
            
            if (city) {
                whereClause = 'WHERE ps.city = $1';
                params.push(city);
            }
            
            const result = await query(`
                SELECT 
                    ps.city,
                    COUNT(ps.id) as total_agents,
                    COUNT(CASE WHEN ast.status = 'online' THEN 1 END) as online_agents,
                    SUM(COALESCE(ast.active_tickets_count, 0)) as total_active_tickets,
                    AVG(COALESCE(ast.active_tickets_count, 0)) as avg_tickets_per_agent
                FROM platform_staff ps
                LEFT JOIN agent_status ast ON ps.id = ast.agent_id
                ${whereClause}
                AND ps.role = 'support' 
                AND ps.status = 'active'
                GROUP BY ps.city
                ORDER BY ps.city
            `, params);
            
            return result.rows;
        } catch (error) {
            console.error('[TicketAssignmentEngine] Error getting assignment stats:', error);
            return [];
        }
    }
}

module.exports = TicketAssignmentEngine;