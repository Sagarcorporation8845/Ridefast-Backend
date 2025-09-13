// packages/support-service/routes/drivers.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');

const router = express.Router();

/**
 * @route GET /drivers
 * @desc Get list of drivers with filtering and pagination
 * @access Private (City Admin, Support)
 */
router.get('/', tokenVerify, async (req, res) => {
    try {
        const { role, city } = req.agent;
        const {
            page = 1,
            limit = 20,
            status,
            search,
            verification_status
        } = req.query;

        const offset = (page - 1) * limit;
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        // City restriction for city admin and support
        if (role === 'city_admin' || role === 'support') {
            whereConditions.push(`d.city = $${paramIndex}`);
            params.push(city);
            paramIndex++;
        }

        // Status filter
        if (status) {
            whereConditions.push(`d.status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        // Search filter
        if (search) {
            whereConditions.push(`(u.full_name ILIKE $${paramIndex} OR u.phone_number ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ?
            `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get drivers with user details
        const driversQuery = `
      SELECT 
        d.id,
        d.user_id,
        d.city,
        d.status,
        d.is_verified,
        d.created_at,
        u.full_name,
        u.phone_number,
        u.email,
        dv.model_name,
        dv.registration_number,
        dv.category as vehicle_category,
        dv.fuel_type,
        COUNT(dd.id) as total_documents,
        COUNT(CASE WHEN dd.status = 'approved' THEN 1 END) as approved_documents
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
      LEFT JOIN driver_documents dd ON d.id = dd.driver_id
      ${whereClause}
      GROUP BY d.id, u.id, dv.id
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

        // Count total drivers
        const countQuery = `
      SELECT COUNT(DISTINCT d.id) as total
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      ${whereClause}
    `;

        // Execute queries sequentially to avoid connection pool exhaustion
        const driversResult = await db.query(driversQuery, [...params, limit, offset]);
        const countResult = await db.query(countQuery, params);

        const totalDrivers = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalDrivers / limit);

        res.json({
            success: true,
            data: {
                drivers: driversResult.rows,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalItems: totalDrivers,
                    itemsPerPage: parseInt(limit)
                }
            }
        });

    } catch (error) {
        console.error('Get drivers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch drivers'
        });
    }
});

/**
 * @route GET /drivers/:id
 * @desc Get detailed driver information
 * @access Private (City Admin, Support)
 */
router.get('/:id', tokenVerify, async (req, res) => {
    try {
        const { role, city } = req.agent;
        const { id } = req.params;

        let cityCondition = '';
        let params = [id];

        if (role === 'city_admin' || role === 'support') {
            cityCondition = 'AND d.city = $2';
            params.push(city);
        }

        // Get driver details
        const driverQuery = `
      SELECT 
        d.*,
        u.full_name,
        u.phone_number,
        u.email,
        u.date_of_birth,
        u.gender,
        dv.model_name,
        dv.registration_number,
        dv.category as vehicle_category,
        dv.fuel_type
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
      WHERE d.id = $1 ${cityCondition}
    `;

        // Get driver documents
        const documentsQuery = `
      SELECT * FROM driver_documents 
      WHERE driver_id = $1 
      ORDER BY uploaded_at DESC
    `;

        // Get driver actions/penalties
        const actionsQuery = `
      SELECT 
        da.*,
        u.full_name as agent_name
      FROM driver_actions da
      JOIN users u ON da.agent_id = u.id
      WHERE da.driver_id = $1
      ORDER BY da.created_at DESC
    `;

        // Get recent rides
        const ridesQuery = `
      SELECT 
        r.id,
        r.pickup_address,
        r.destination_address,
        r.status,
        r.fare,
        r.created_at,
        u.full_name as customer_name
      FROM rides r
      JOIN users u ON r.customer_id = u.id
      WHERE r.driver_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
    `;

        // Execute queries sequentially to avoid connection pool exhaustion
        const driverResult = await db.query(driverQuery, params);
        const documentsResult = await db.query(documentsQuery, [id]);
        const actionsResult = await db.query(actionsQuery, [id]);
        const ridesResult = await db.query(ridesQuery, [id]);

        if (driverResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        res.json({
            success: true,
            data: {
                driver: driverResult.rows[0],
                documents: documentsResult.rows,
                actions: actionsResult.rows,
                recentRides: ridesResult.rows
            }
        });

    } catch (error) {
        console.error('Get driver details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch driver details'
        });
    }
});

/**
 * @route PUT /drivers/:id/status
 * @desc Update driver status (approve/suspend/activate)
 * @access Private (City Admin)
 */
router.put('/:id/status', tokenVerify, async (req, res) => {
    try {
        const { role, city, agentId } = req.agent;
        const { id } = req.params;
        const { status, reason } = req.body;

        // Only city admin can change driver status
        if (role !== 'city_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only city admin can change driver status'
            });
        }

        if (!['active', 'suspended', 'pending_verification'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        // Verify driver belongs to the same city
        const driverCheck = await db.query(
            'SELECT city FROM drivers WHERE id = $1',
            [id]
        );

        if (driverCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        if (driverCheck.rows[0].city !== city) {
            return res.status(403).json({
                success: false,
                message: 'Access denied for this driver'
            });
        }

        // Update driver status
        await db.query(
            'UPDATE drivers SET status = $1 WHERE id = $2',
            [status, id]
        );

        // Log the action
        if (status === 'suspended' && reason) {
            await db.query(
                `INSERT INTO driver_actions (driver_id, agent_id, action_type, reason)
         VALUES ($1, $2, 'suspension', $3)`,
                [id, agentId, reason]
            );
        }

        res.json({
            success: true,
            message: `Driver status updated to ${status}`
        });

    } catch (error) {
        console.error('Update driver status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update driver status'
        });
    }
});

/**
 * @route PUT /drivers/:id/documents/:docId/verify
 * @desc Verify or reject driver document
 * @access Private (City Admin, Support)
 */
router.put('/:id/documents/:docId/verify', tokenVerify, async (req, res) => {
    try {
        const { role, city } = req.agent;
        const { id, docId } = req.params;
        const { status, rejection_reason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification status'
            });
        }

        if (status === 'rejected' && !rejection_reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        // Verify driver belongs to the same city
        const driverCheck = await db.query(
            'SELECT city FROM drivers WHERE id = $1',
            [id]
        );

        if (driverCheck.rows.length === 0 || driverCheck.rows[0].city !== city) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Update document status
        await db.query(
            `UPDATE driver_documents 
       SET status = $1, rejection_reason = $2 
       WHERE id = $3 AND driver_id = $4`,
            [status, rejection_reason || null, docId, id]
        );

        // Check if all documents are approved to update driver verification
        if (status === 'approved') {
            const documentsCheck = await db.query(
                `SELECT COUNT(*) as total,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved
         FROM driver_documents WHERE driver_id = $1`,
                [id]
            );

            const { total, approved } = documentsCheck.rows[0];
            if (parseInt(total) === parseInt(approved) && parseInt(total) >= 4) {
                await db.query(
                    'UPDATE drivers SET is_verified = true, status = $1 WHERE id = $2',
                    ['active', id]
                );
            }
        }

        res.json({
            success: true,
            message: `Document ${status} successfully`
        });

    } catch (error) {
        console.error('Verify document error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify document'
        });
    }
});

/**
 * @route POST /drivers/:id/actions
 * @desc Add action/penalty to driver
 * @access Private (City Admin)
 */
router.post('/:id/actions', tokenVerify, async (req, res) => {
    try {
        const { role, city, agentId } = req.agent;
        const { id } = req.params;
        const { action_type, reason, fine_amount, suspension_duration } = req.body;

        if (role !== 'city_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only city admin can add driver actions'
            });
        }

        if (!['warning', 'fine', 'suspension'].includes(action_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action type'
            });
        }

        // Verify driver belongs to the same city
        const driverCheck = await db.query(
            'SELECT city FROM drivers WHERE id = $1',
            [id]
        );

        if (driverCheck.rows.length === 0 || driverCheck.rows[0].city !== city) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Add action
        await db.query(
            `INSERT INTO driver_actions 
       (driver_id, agent_id, action_type, reason, fine_amount, suspension_duration)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, agentId, action_type, reason, fine_amount || null, suspension_duration || null]
        );

        // Update driver status if suspended
        if (action_type === 'suspension') {
            await db.query(
                'UPDATE drivers SET status = $1 WHERE id = $2',
                ['suspended', id]
            );
        }

        res.json({
            success: true,
            message: `${action_type} added successfully`
        });

    } catch (error) {
        console.error('Add driver action error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add driver action'
        });
    }
});

module.exports = router;