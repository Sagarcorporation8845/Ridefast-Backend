// packages/support-service/routes/support.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, validateBody, sanitizeInput } = require('../middleware/queryValidation');

const router = express.Router();

/**
 * @route GET /support/tickets
 * @desc Get support tickets
 * @access Private (City Admin, Support)
 */
router.get('/tickets', tokenVerify, sanitizeInput, validateQuery('supportTickets'), async (req, res) => {
  try {
    const { agentId } = req.user;
    const { 
      page = 1, 
      limit = 20, 
      status,
      priority 
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = ['st.created_by_agent_id = $1'];
    let params = [agentId];
    let paramIndex = 2;

    // Status filter
    if (status) {
      whereConditions.push(`st.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get support tickets
    const ticketsQuery = `
      SELECT 
        st.id,
        st.subject,
        st.status,
        st.created_at,
        u.full_name as created_by_name
      FROM support_tickets st
      JOIN users u ON st.created_by_agent_id = u.id
      ${whereClause}
      ORDER BY st.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Count total tickets
    const countQuery = `
      SELECT COUNT(*) as total
      FROM support_tickets st
      ${whereClause}
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const ticketsResult = await db.query(ticketsQuery, [...params, limit, offset]);
    const countResult = await db.query(countQuery, params);

    const totalTickets = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalTickets / limit);

    res.json({
      success: true,
      data: {
        tickets: ticketsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalTickets,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get support tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets'
    });
  }
});

/**
 * @route POST /support/tickets
 * @desc Create new support ticket
 * @access Private (City Admin, Support)
 */
router.post('/tickets', tokenVerify, sanitizeInput, validateBody('createTicket'), async (req, res) => {
  try {
    const { agentId } = req.user;
    const { subject, description, priority = 'medium', category } = req.body;

    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Subject and description are required'
      });
    }

    // Create support ticket
    const ticketResult = await db.query(
      `INSERT INTO support_tickets (created_by_agent_id, subject, status)
       VALUES ($1, $2, 'open')
       RETURNING id, subject, status, created_at`,
      [agentId, subject]
    );

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: ticketResult.rows[0]
    });

  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket'
    });
  }
});

/**
 * @route PUT /support/tickets/:id/status
 * @desc Update support ticket status
 * @access Private (City Admin, Support)
 */
router.put('/tickets/:id/status', tokenVerify, sanitizeInput, validateBody('updateTicketStatus'), async (req, res) => {
  try {
    const { agentId } = req.user;
    const { id } = req.params;
    const { status } = req.body;

    if (!['open', 'pending_admin', 'resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket status'
      });
    }

    // Verify ticket ownership
    const ticketCheck = await db.query(
      'SELECT created_by_agent_id FROM support_tickets WHERE id = $1',
      [id]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    if (ticketCheck.rows[0].created_by_agent_id !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this ticket'
      });
    }

    // Update ticket status
    await db.query(
      'UPDATE support_tickets SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({
      success: true,
      message: `Ticket status updated to ${status}`
    });

  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
});

/**
 * @route GET /support/quick-actions
 * @desc Get quick action items for support dashboard
 * @access Private (City Admin, Support)
 */
router.get('/quick-actions', tokenVerify, sanitizeInput, async (req, res) => {
  try {
    const { role, city } = req.user;

    let cityCondition = '';
    let params = [];
    
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $1';
      params.push(city);
    }

    // Get pending driver verifications
    const pendingDriversQuery = `
      SELECT 
        d.id,
        u.full_name,
        u.phone_number,
        d.created_at,
        COUNT(dd.id) as total_documents,
        COUNT(CASE WHEN dd.status = 'pending' THEN 1 END) as pending_documents
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN driver_documents dd ON d.id = dd.driver_id
      WHERE d.status = 'pending_verification' ${cityCondition}
      GROUP BY d.id, u.full_name, u.phone_number, d.created_at
      ORDER BY d.created_at ASC
      LIMIT 10
    `;

    // Get recent cancelled rides
    const cancelledRidesQuery = `
      SELECT 
        r.id,
        r.pickup_address,
        r.destination_address,
        r.created_at,
        cu.full_name as customer_name,
        du.full_name as driver_name
      FROM rides r
      JOIN users cu ON r.customer_id = cu.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      WHERE r.status = 'cancelled' 
      AND DATE(r.created_at) = CURRENT_DATE ${cityCondition}
      ORDER BY r.created_at DESC
      LIMIT 5
    `;

    // Get drivers with recent penalties
    const recentPenaltiesQuery = `
      SELECT 
        da.id,
        da.action_type,
        da.reason,
        da.created_at,
        u.full_name as driver_name,
        d.city
      FROM driver_actions da
      JOIN drivers d ON da.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE DATE(da.created_at) >= CURRENT_DATE - INTERVAL '7 days' ${cityCondition}
      ORDER BY da.created_at DESC
      LIMIT 5
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const pendingDrivers = await db.query(pendingDriversQuery, params);
    const cancelledRides = await db.query(cancelledRidesQuery, params);
    const recentPenalties = await db.query(recentPenaltiesQuery, params);

    res.json({
      success: true,
      data: {
        pendingDriverVerifications: pendingDrivers.rows,
        recentCancelledRides: cancelledRides.rows,
        recentPenalties: recentPenalties.rows
      }
    });

  } catch (error) {
    console.error('Get quick actions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quick actions'
    });
  }
});

/**
 * @route GET /support/notifications
 * @desc Get notifications for support staff
 * @access Private (City Admin, Support)
 */
router.get('/notifications', tokenVerify, sanitizeInput, validateQuery('pagination'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;
    let cityCondition = '';
    let params = [];
    
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $1';
      params.push(city);
    }

    // Get system notifications (new drivers, document uploads, etc.)
    const notificationsQuery = `
      SELECT 
        'driver_registration' as type,
        d.id as reference_id,
        u.full_name as title,
        'New driver registration pending verification' as message,
        d.created_at as timestamp
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'pending_verification' 
      AND d.created_at >= NOW() - INTERVAL '24 hours' ${cityCondition}
      
      UNION ALL
      
      SELECT 
        'document_upload' as type,
        dd.driver_id as reference_id,
        u.full_name as title,
        CONCAT('New ', dd.document_type, ' document uploaded') as message,
        dd.uploaded_at as timestamp
      FROM driver_documents dd
      JOIN drivers d ON dd.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE dd.status = 'pending' 
      AND dd.uploaded_at >= NOW() - INTERVAL '24 hours' ${cityCondition}
      
      ORDER BY timestamp DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const notifications = await db.query(notificationsQuery, [...params, limit, offset]);

    res.json({
      success: true,
      data: {
        notifications: notifications.rows,
        pagination: {
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

/**
 * @route POST /support/broadcast
 * @desc Send broadcast message to drivers/customers
 * @access Private (City Admin only)
 */
router.post('/broadcast', tokenVerify, sanitizeInput, validateBody('broadcast'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { message, target_audience, urgency = 'normal' } = req.body;

    // Only city admin can send broadcasts
    if (role !== 'city_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only city admin can send broadcast messages'
      });
    }

    if (!message || !target_audience) {
      return res.status(400).json({
        success: false,
        message: 'Message and target audience are required'
      });
    }

    if (!['drivers', 'customers', 'all'].includes(target_audience)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target audience'
      });
    }

    // Log the broadcast (in a real system, this would trigger push notifications)
    console.log(`Broadcast message from ${role} in ${city}:`);
    console.log(`Target: ${target_audience}, Urgency: ${urgency}`);
    console.log(`Message: ${message}`);

    // Here you would integrate with your push notification service
    // For now, we'll just return success

    res.json({
      success: true,
      message: 'Broadcast message sent successfully',
      data: {
        target_audience,
        urgency,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Send broadcast error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send broadcast message'
    });
  }
});

module.exports = router;