const bcrypt = require('bcryptjs');
const { query } = require('../db');

// Create support agent
const createAgent = async (req, res) => {
    
    try {
        const { fullName, email, password, city } = req.body;
        
        // Check if email already exists
        const existingUser = await query(
            'SELECT id FROM platform_staff WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Email already exists',
                    timestamp: new Date()
                }
            });
        }
        
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create agent
        const result = await query(
            `INSERT INTO platform_staff (full_name, email, password_hash, role, city, status, created_by)
             VALUES ($1, $2, $3, 'support', $4, 'active', $5)
             RETURNING id, full_name, email, role, city, status, created_at`,
            [fullName, email, passwordHash, city, req.user.id]
        );
        
        const newAgent = result.rows[0];
        
        // Initialize agent status
        await query(
            'INSERT INTO agent_status (agent_id, status, active_tickets_count) VALUES ($1, $2, $3)',
            [newAgent.id, 'offline', 0]
        );
        
        res.status(201).json({
            success: true,
            data: {
                agent: {
                    id: newAgent.id,
                    fullName: newAgent.full_name,
                    email: newAgent.email,
                    role: newAgent.role,
                    city: newAgent.city,
                    status: newAgent.status,
                    createdAt: newAgent.created_at
                }
            }
        });
        
    } catch (error) {
        console.error('Error creating agent:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to create agent',
                timestamp: new Date()
            }
        });
    }
};

// Get agents with city-based filtering
const getAgents = async (req, res) => {
    try {
        let queryStr = `
            SELECT ps.id, ps.full_name, ps.email, ps.role, ps.city, ps.status, ps.created_at,
                   ast.status as online_status, ast.active_tickets_count, ast.last_activity
            FROM platform_staff ps
            LEFT JOIN agent_status ast ON ps.id = ast.agent_id
            WHERE ps.role = 'support'
        `;
        
        const params = [];
        
        // Apply city filtering based on user role
        if (req.user.role === 'city_admin' || req.user.role === 'support') {
            queryStr += ' AND ps.city = $1';
            params.push(req.user.city);
        } else if (req.query.city) {
            queryStr += ' AND ps.city = $1';
            params.push(req.query.city);
        }
        
        queryStr += ' ORDER BY ps.created_at DESC';
        
        const result = await query(queryStr, params);
        
        const agents = result.rows.map(row => ({
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            role: row.role,
            city: row.city,
            status: row.status,
            onlineStatus: row.online_status || 'offline',
            activeTicketsCount: row.active_tickets_count || 0,
            lastActivity: row.last_activity,
            createdAt: row.created_at
        }));
        
        res.json({
            success: true,
            data: { agents }
        });
        
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({
            error: {
                type: 'DATABASE_ERROR',
                message: 'Failed to fetch agents',
                timestamp: new Date()
            }
        });
    }
};

// Update agent status
const updateAgentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        // Check if agent exists and user has permission to update
        let checkQuery = 'SELECT id, city FROM platform_staff WHERE id = $1 AND role = $2';
        const checkParams = [id, 'support'];
        
        if (req.user.role === 'city_admin') {
            checkQuery += ' AND city = $3';
            checkParams.push(req.user.city);
        }
        
        const agentCheck = await query(checkQuery, checkParams);
        
        if (agentCheck.rows.length === 0) {
            return res.status(404).json({
                error: {
                    type: 'RESOURCE_NOT_FOUND',
                    message: 'Agent not found or access denied',
                    timestamp: new Date()
                }
            });
        }
        
        // Update agent status
        const result = await query(
            'UPDATE platform_staff SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, id]
        );
        
        const updatedAgent = result.rows[0];
        
        res.json({
            success: true,
            data: {
                agent: {
                    id: updatedAgent.id,
                    fullName: updatedAgent.full_name,
                    email: updatedAgent.email,
                    role: updatedAgent.role,
                    city: updatedAgent.city,
                    status: updatedAgent.status,
                    updatedAt: updatedAgent.updated_at
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

module.exports = {
    createAgent,
    getAgents,
    updateAgentStatus
};