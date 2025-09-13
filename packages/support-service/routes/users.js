// packages/support-service/routes/users.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');

const router = express.Router();

/**
 * @route GET /users
 * @desc Get list of users with filtering and pagination
 * @access Private (City Admin, Support)
 */
router.get('/', tokenVerify, async (req, res) => {
  try {
    const { role, city } = req.agent;
    const { 
      page = 1, 
      limit = 20, 
      search,
      user_type = 'customer' // customer, driver, all
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Search filter
    if (search) {
      whereConditions.push(`(u.full_name ILIKE $${paramIndex} OR u.phone_number ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    let joinClause = '';
    let selectFields = `
      u.id,
      u.phone_number,
      u.full_name,
      u.email,
      u.created_at,
      u.date_of_birth,
      u.gender,
      u.home_address,
      u.work_address
    `;

    // Filter by user type and city for city admin/support
    if (user_type === 'driver') {
      joinClause = 'JOIN drivers d ON u.id = d.user_id';
      selectFields += ', d.city, d.status as driver_status, d.is_verified';
      
      if (role === 'city_admin' || role === 'support') {
        whereConditions.push(`d.city = $${paramIndex}`);
        params.push(city);
        paramIndex++;
      }
    } else if (user_type === 'customer') {
      joinClause = 'LEFT JOIN drivers d ON u.id = d.user_id';
      whereConditions.push('d.id IS NULL');
    }

    const whereClause = whereConditions.length > 0 ? 
      `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get users
    const usersQuery = `
      SELECT ${selectFields}
      FROM users u
      ${joinClause}
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Count total users
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      ${joinClause}
      ${whereClause}
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const usersResult = await db.query(usersQuery, [...params, limit, offset]);
    const countResult = await db.query(countQuery, params);

    const totalUsers = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      data: {
        users: usersResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalUsers,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * @route GET /users/:id
 * @desc Get detailed user information
 * @access Private (City Admin, Support)
 */
router.get('/:id', tokenVerify, async (req, res) => {
  try {
    const { role, city } = req.agent;
    const { id } = req.params;

    // Get user details
    const userQuery = `
      SELECT 
        u.*,
        d.id as driver_id,
        d.city as driver_city,
        d.status as driver_status,
        d.is_verified as driver_verified,
        dv.model_name,
        dv.registration_number,
        dv.category as vehicle_category,
        w.balance as wallet_balance
      FROM users u
      LEFT JOIN drivers d ON u.id = d.user_id
      LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
      LEFT JOIN wallets w ON u.id = w.user_id
      WHERE u.id = $1
    `;

    const userResult = await db.query(userQuery, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check city access for drivers
    if (user.driver_id && (role === 'city_admin' || role === 'support')) {
      if (user.driver_city !== city) {
        return res.status(403).json({
          success: false,
          message: 'Access denied for this user'
        });
      }
    }

    // Get user's ride history
    const ridesQuery = `
      SELECT 
        r.id,
        r.pickup_address,
        r.destination_address,
        r.status,
        r.fare,
        r.created_at,
        CASE 
          WHEN r.customer_id = $1 THEN 'customer'
          WHEN r.driver_id = (SELECT id FROM drivers WHERE user_id = $1) THEN 'driver'
        END as role_in_ride
      FROM rides r
      WHERE r.customer_id = $1 
         OR r.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
      ORDER BY r.created_at DESC
      LIMIT 20
    `;

    // Get wallet transactions
    const transactionsQuery = `
      SELECT 
        t.id,
        t.amount,
        t.type,
        t.status,
        t.created_at,
        r.pickup_address,
        r.destination_address
      FROM transactions t
      JOIN wallets w ON t.wallet_id = w.id
      LEFT JOIN rides r ON t.ride_id = r.id
      WHERE w.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT 20
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const ridesResult = await db.query(ridesQuery, [id]);
    const transactionsResult = await db.query(transactionsQuery, [id]);

    res.json({
      success: true,
      data: {
        user: user,
        rides: ridesResult.rows,
        transactions: transactionsResult.rows
      }
    });

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    });
  }
});

/**
 * @route PUT /users/:id/wallet
 * @desc Adjust user wallet balance (for refunds/adjustments)
 * @access Private (City Admin)
 */
router.put('/:id/wallet', tokenVerify, async (req, res) => {
  try {
    const { role, agentId } = req.agent;
    const { id } = req.params;
    const { amount, type, reason } = req.body;

    // Only city admin can adjust wallet
    if (role !== 'city_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only city admin can adjust wallet balance'
      });
    }

    if (!amount || !type || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Amount, type, and reason are required'
      });
    }

    if (!['refund', 'adjustment', 'fine'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type'
      });
    }

    // Get user's wallet
    const walletResult = await db.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1',
      [id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User wallet not found'
      });
    }

    const wallet = walletResult.rows[0];
    const newBalance = parseFloat(wallet.balance) + parseFloat(amount);

    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance for this adjustment'
      });
    }

    // Update wallet balance
    await db.query(
      'UPDATE wallets SET balance = $1 WHERE id = $2',
      [newBalance, wallet.id]
    );

    // Create transaction record
    await db.query(
      `INSERT INTO transactions (wallet_id, amount, type, status, gateway_transaction_id)
       VALUES ($1, $2, $3, 'successful', $4)`,
      [wallet.id, amount, type, `ADMIN_${Date.now()}`]
    );

    // Log the adjustment
    console.log(`Wallet adjustment by ${role} (${agentId}): User ${id}, Amount: ${amount}, Type: ${type}, Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Wallet balance adjusted successfully',
      data: {
        newBalance: newBalance,
        adjustment: amount,
        type: type
      }
    });

  } catch (error) {
    console.error('Wallet adjustment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjust wallet balance'
    });
  }
});

/**
 * @route GET /users/analytics/summary
 * @desc Get user analytics summary
 * @access Private (City Admin, Support)
 */
router.get('/analytics/summary', tokenVerify, async (req, res) => {
  try {
    const { role, city } = req.agent;
    const { period = '30d' } = req.query;

    let dateCondition = '';
    if (period === '7d') {
      dateCondition = `AND u.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      dateCondition = `AND u.created_at >= NOW() - INTERVAL '30 days'`;
    } else if (period === '1y') {
      dateCondition = `AND u.created_at >= NOW() - INTERVAL '1 year'`;
    }

    // User registration analytics
    const userStatsQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN DATE(u.created_at) = CURRENT_DATE THEN 1 END) as today_registrations,
        COUNT(CASE WHEN u.created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as week_registrations
      FROM users u
      WHERE 1=1 ${dateCondition}
    `;

    // Driver analytics (city-specific for city admin/support)
    let driverStatsQuery = `
      SELECT 
        COUNT(*) as total_drivers,
        COUNT(CASE WHEN d.status = 'active' THEN 1 END) as active_drivers,
        COUNT(CASE WHEN d.status = 'pending_verification' THEN 1 END) as pending_drivers
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1 ${dateCondition}
    `;

    let params = [];
    if (role === 'city_admin' || role === 'support') {
      driverStatsQuery += ' AND d.city = $1';
      params.push(city);
    }

    // Execute queries sequentially to avoid connection pool exhaustion
    const userStatsResult = await db.query(userStatsQuery, []);
    const driverStatsResult = await db.query(driverStatsQuery, params);

    res.json({
      success: true,
      data: {
        userStats: userStatsResult.rows[0],
        driverStats: driverStatsResult.rows[0],
        period
      }
    });

  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user analytics'
    });
  }
});

module.exports = router;