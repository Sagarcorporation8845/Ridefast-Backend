// packages/support-service/routes/rides.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, validateBody, sanitizeInput } = require('../middleware/queryValidation');

const router = express.Router();

/**
 * @route GET /rides
 * @desc Get list of rides with filtering and pagination
 * @access Private (City Admin, Support)
 */
router.get('/', tokenVerify, sanitizeInput, validateQuery('ridesList'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      date_from,
      date_to,
      search 
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
      whereConditions.push(`r.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Date range filter
    if (date_from) {
      whereConditions.push(`DATE(r.created_at) >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereConditions.push(`DATE(r.created_at) <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }

    // Search filter (customer name or phone)
    if (search) {
      whereConditions.push(`(cu.full_name ILIKE $${paramIndex} OR cu.phone_number ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 
      `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get rides with customer and driver details
    const ridesQuery = `
      SELECT 
        r.id,
        r.pickup_address,
        r.destination_address,
        r.pickup_latitude,
        r.pickup_longitude,
        r.destination_latitude,
        r.destination_longitude,
        r.status,
        r.fare,
        r.created_at,
        cu.full_name as customer_name,
        cu.phone_number as customer_phone,
        du.full_name as driver_name,
        du.phone_number as driver_phone,
        dv.registration_number,
        dv.category as vehicle_category
      FROM rides r
      JOIN users cu ON r.customer_id = cu.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Count total rides
    const countQuery = `
      SELECT COUNT(*) as total
      FROM rides r
      JOIN users cu ON r.customer_id = cu.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      ${whereClause}
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const ridesResult = await db.query(ridesQuery, [...params, limit, offset]);
    const countResult = await db.query(countQuery, params);

    const totalRides = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRides / limit);

    res.json({
      success: true,
      data: {
        rides: ridesResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalRides,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get rides error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rides'
    });
  }
});

/**
 * @route GET /rides/:id
 * @desc Get detailed ride information
 * @access Private (City Admin, Support)
 */
router.get('/:id', tokenVerify, sanitizeInput, async (req, res) => {
  try {
    const { role, city } = req.user;
    const { id } = req.params;

    let cityCondition = '';
    let params = [id];
    
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $2';
      params.push(city);
    }

    // Get ride details
    const rideQuery = `
      SELECT 
        r.*,
        cu.full_name as customer_name,
        cu.phone_number as customer_phone,
        cu.email as customer_email,
        du.full_name as driver_name,
        du.phone_number as driver_phone,
        du.email as driver_email,
        d.city as driver_city,
        dv.model_name,
        dv.registration_number,
        dv.category as vehicle_category,
        dv.fuel_type
      FROM rides r
      JOIN users cu ON r.customer_id = cu.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
      WHERE r.id = $1 ${cityCondition}
    `;

    // Get ride transactions
    const transactionsQuery = `
      SELECT 
        t.*,
        w.user_id
      FROM transactions t
      JOIN wallets w ON t.wallet_id = w.id
      WHERE t.ride_id = $1
      ORDER BY t.created_at DESC
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const rideResult = await db.query(rideQuery, params);
    const transactionsResult = await db.query(transactionsQuery, [id]);

    if (rideResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    res.json({
      success: true,
      data: {
        ride: rideResult.rows[0],
        transactions: transactionsResult.rows
      }
    });

  } catch (error) {
    console.error('Get ride details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ride details'
    });
  }
});

/**
 * @route PUT /rides/:id/status
 * @desc Update ride status (for emergency interventions)
 * @access Private (City Admin)
 */
router.put('/:id/status', tokenVerify, sanitizeInput, validateBody('rideStatusUpdate'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { id } = req.params;
    const { status, reason } = req.body;

    // Only city admin can change ride status
    if (role !== 'city_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only city admin can change ride status'
      });
    }

    if (!['cancelled', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status for manual update'
      });
    }

    // Verify ride belongs to the same city
    const rideCheck = await db.query(
      `SELECT r.id, d.city 
       FROM rides r 
       LEFT JOIN drivers d ON r.driver_id = d.id 
       WHERE r.id = $1`,
      [id]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (rideCheck.rows[0].city && rideCheck.rows[0].city !== city) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this ride'
      });
    }

    // Update ride status
    await db.query(
      'UPDATE rides SET status = $1 WHERE id = $2',
      [status, id]
    );

    // Log the manual intervention (you might want to create a separate table for this)
    console.log(`Manual ride status change by ${role} in ${city}: Ride ${id} set to ${status}. Reason: ${reason}`);

    res.json({
      success: true,
      message: `Ride status updated to ${status}`
    });

  } catch (error) {
    console.error('Update ride status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ride status'
    });
  }
});

/**
 * @route GET /rides/analytics/summary
 * @desc Get ride analytics summary
 * @access Private (City Admin, Support)
 */
router.get('/analytics/summary', tokenVerify, sanitizeInput, validateQuery('rideAnalytics'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { period = '7d' } = req.query;

    let dateCondition = '';
    let cityCondition = '';
    let params = [];

    // City restriction
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $1';
      params.push(city);
    }

    // Date period
    if (period === '7d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '30 days'`;
    } else if (period === '1y') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '1 year'`;
    }

    // Ride statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_rides,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
        COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) as cancelled_rides,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as avg_fare
      FROM rides r
      LEFT JOIN drivers d ON r.driver_id = d.id
      WHERE 1=1 ${dateCondition} ${cityCondition}
    `;

    // Peak hours analysis
    const peakHoursQuery = `
      SELECT 
        EXTRACT(HOUR FROM r.created_at) as hour,
        COUNT(*) as ride_count
      FROM rides r
      LEFT JOIN drivers d ON r.driver_id = d.id
      WHERE 1=1 ${dateCondition} ${cityCondition}
      GROUP BY EXTRACT(HOUR FROM r.created_at)
      ORDER BY ride_count DESC
      LIMIT 5
    `;

    const [statsResult, peakHoursResult] = await Promise.all([
      db.query(statsQuery, params),
      db.query(peakHoursQuery, params)
    ]);

    res.json({
      success: true,
      data: {
        summary: statsResult.rows[0],
        peakHours: peakHoursResult.rows,
        period
      }
    });

  } catch (error) {
    console.error('Ride analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ride analytics'
    });
  }
});

module.exports = router;