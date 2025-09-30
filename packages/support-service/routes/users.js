// packages/support-service/routes/users.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, validateBody, sanitizeInput } = require('../middleware/queryValidation');

const router = express.Router();

/**
 * @route GET /users
 * @desc Get a list of all support agents within a city administrator's city.
 * @access Private (City Admin only)
 */
router.get('/', tokenVerify, sanitizeInput, async (req, res) => {
  try {
    const { role, city } = req.user;

    // --- Authorization Check: Only city_admin can access this endpoint ---
    if (role !== 'city_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This resource is available only to city administrators.'
      });
    }

    const agentsQuery = `
      SELECT 
        ps.id,
        ps.full_name,
        ps.email,
        ps.status as account_status,
        ps.created_at,
        COALESCE(ags.status, 'offline') as online_status,
        COALESCE(ags.active_tickets_count, 0) as active_tickets_count
      FROM platform_staff ps
      LEFT JOIN agent_status ags ON ps.id = ags.agent_id
      WHERE ps.city = $1 AND ps.role = 'support'
      ORDER BY ps.full_name
    `;

    const agentsResult = await db.query(agentsQuery, [city]);

    res.json({
      success: true,
      data: {
        agents: agentsResult.rows
      }
    });

  } catch (error) {
    console.error('Get support agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support agents'
    });
  }
});

/**
 * @route GET /users/:id
 * @desc Get detailed user information
 * @access Private (City Admin, Support)
 */
router.get('/:id', tokenVerify, sanitizeInput, async (req, res) => {
  try {
    const { role, city } = req.user;
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
router.put('/:id/wallet', tokenVerify, sanitizeInput, validateBody('walletAdjustment'), async (req, res) => {
  try {
    const { role, agentId } = req.user;
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
router.get('/analytics/summary', tokenVerify, sanitizeInput, validateQuery('userAnalytics'), async (req, res) => {
  try {
    const { role, city } = req.user;
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