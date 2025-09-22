// packages/support-service/routes/reports.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, sanitizeInput } = require('../middleware/queryValidation');

const router = express.Router();

/**
 * @route GET /reports/daily
 * @desc Generate daily operations report
 * @access Private (City Admin, Support)
 */
router.get('/daily', tokenVerify, sanitizeInput, validateQuery('dailyReport'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    let cityCondition = '';
    let params = [date];
    
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $2';
      params.push(city);
    }

    // Daily ride statistics
    const rideStatsQuery = `
      SELECT 
        COUNT(*) as total_rides,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
        COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) as cancelled_rides,
        COUNT(CASE WHEN r.status = 'requested' THEN 1 END) as pending_rides,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as avg_fare
      FROM rides r
      LEFT JOIN drivers d ON r.driver_id = d.id
      WHERE DATE(r.created_at) = $1 ${cityCondition}
    `;

    // Active drivers count
    const activeDriversQuery = `
      SELECT COUNT(DISTINCT d.id) as active_drivers
      FROM drivers d
      JOIN rides r ON d.id = r.driver_id
      WHERE DATE(r.created_at) = $1 
      AND d.status = 'active' ${cityCondition}
    `;

    // New registrations
    const newRegistrationsQuery = `
      SELECT 
        COUNT(CASE WHEN d.id IS NULL THEN 1 END) as new_customers,
        COUNT(CASE WHEN d.id IS NOT NULL THEN 1 END) as new_drivers
      FROM users u
      LEFT JOIN drivers d ON u.id = d.user_id
      WHERE DATE(u.created_at) = $1
      ${role === 'city_admin' || role === 'support' ? 'AND (d.city = $2 OR d.city IS NULL)' : ''}
    `;

    // Peak hours analysis
    const peakHoursQuery = `
      SELECT 
        EXTRACT(HOUR FROM r.created_at) as hour,
        COUNT(*) as ride_count
      FROM rides r
      LEFT JOIN drivers d ON r.driver_id = d.id
      WHERE DATE(r.created_at) = $1 ${cityCondition}
      GROUP BY EXTRACT(HOUR FROM r.created_at)
      ORDER BY ride_count DESC
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const rideStats = await db.query(rideStatsQuery, params);
    const activeDrivers = await db.query(activeDriversQuery, params);
    const newRegistrations = await db.query(newRegistrationsQuery, params);
    const peakHours = await db.query(peakHoursQuery, params);

    res.json({
      success: true,
      data: {
        date,
        city: role === 'city_admin' || role === 'support' ? city : 'All Cities',
        rideStatistics: rideStats.rows[0],
        activeDrivers: parseInt(activeDrivers.rows[0].active_drivers),
        newRegistrations: newRegistrations.rows[0],
        peakHours: peakHours.rows
      }
    });

  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate daily report'
    });
  }
});

/**
 * @route GET /reports/weekly
 * @desc Generate weekly operations report
 * @access Private (City Admin, Support)
 */
router.get('/weekly', tokenVerify, sanitizeInput, validateQuery('weeklyReport'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { week_start } = req.query;

    let startDate = week_start ? new Date(week_start) : new Date();
    if (!week_start) {
      startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of current week
    }
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // End of week

    let cityCondition = '';
    let params = [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]];
    
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $3';
      params.push(city);
    }

    // Weekly trends
    const weeklyTrendsQuery = `
      SELECT 
        DATE(r.created_at) as date,
        COUNT(*) as total_rides,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as revenue
      FROM rides r
      LEFT JOIN drivers d ON r.driver_id = d.id
      WHERE DATE(r.created_at) BETWEEN $1 AND $2 ${cityCondition}
      GROUP BY DATE(r.created_at)
      ORDER BY date
    `;

    // Driver performance
    const driverPerformanceQuery = `
      SELECT 
        u.full_name as driver_name,
        COUNT(r.id) as total_rides,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as total_earnings,
        COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as avg_fare
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN rides r ON d.id = r.driver_id AND DATE(r.created_at) BETWEEN $1 AND $2
      WHERE d.status = 'active' ${cityCondition}
      GROUP BY d.id, u.full_name
      HAVING COUNT(r.id) > 0
      ORDER BY total_rides DESC
      LIMIT 20
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const weeklyTrends = await db.query(weeklyTrendsQuery, params);
    const driverPerformance = await db.query(driverPerformanceQuery, params);

    res.json({
      success: true,
      data: {
        weekStart: startDate.toISOString().split('T')[0],
        weekEnd: endDate.toISOString().split('T')[0],
        city: role === 'city_admin' || role === 'support' ? city : 'All Cities',
        weeklyTrends: weeklyTrends.rows,
        topDrivers: driverPerformance.rows
      }
    });

  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate weekly report'
    });
  }
});

/**
 * @route GET /reports/financial
 * @desc Generate financial report
 * @access Private (City Admin only)
 */
router.get('/financial', tokenVerify, sanitizeInput, validateQuery('financialReport'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { 
      start_date, 
      end_date,
      period = 'monthly' 
    } = req.query;

    // Only city admin can access financial reports
    if (role !== 'city_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only city admin can access financial reports'
      });
    }

    let params = [];
    let paramIndex = 1;

    let rideDateCondition = '';
    let ledgerDateCondition = '';
    let transactionDateCondition = '';

    if (start_date && end_date) {
      rideDateCondition = `AND DATE(r.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      ledgerDateCondition = `AND DATE(dl.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      transactionDateCondition = `AND DATE(t.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(start_date, end_date);
      paramIndex += 2;
    } else if (period === 'monthly') {
      rideDateCondition = `AND r.created_at >= DATE_TRUNC('month', CURRENT_DATE)`;
      ledgerDateCondition = `AND dl.created_at >= DATE_TRUNC('month', CURRENT_DATE)`;
      transactionDateCondition = `AND t.created_at >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'weekly') {
      rideDateCondition = `AND r.created_at >= DATE_TRUNC('week', CURRENT_DATE)`;
      ledgerDateCondition = `AND dl.created_at >= DATE_TRUNC('week', CURRENT_DATE)`;
      transactionDateCondition = `AND t.created_at >= DATE_TRUNC('week', CURRENT_DATE)`;
    }

    const cityCondition = `AND d.city = $${paramIndex}`;
    params.push(city);

    // Revenue breakdown
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as gross_revenue,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
        COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as avg_ride_value
      FROM rides r
      JOIN drivers d ON r.driver_id = d.id
      WHERE 1=1 ${rideDateCondition} ${cityCondition}
    `;

    // Driver earnings and platform fees
    const earningsQuery = `
      SELECT 
        SUM(CASE WHEN dl.type = 'ride_earning' THEN dl.amount END) as driver_earnings,
        SUM(CASE WHEN dl.type = 'platform_fee' THEN ABS(dl.amount) END) as platform_fees,
        SUM(CASE WHEN dl.type = 'fine' THEN ABS(dl.amount) END) as fines_collected
      FROM driver_ledger dl
      JOIN drivers d ON dl.driver_id = d.id
      WHERE 1=1 ${ledgerDateCondition} ${cityCondition}
    `;

    // Transaction summary
    const transactionQuery = `
      SELECT 
        COUNT(CASE WHEN t.status = 'successful' THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_transactions,
        SUM(CASE WHEN t.status = 'successful' AND t.type = 'wallet_recharge' THEN t.amount END) as wallet_recharges
      FROM transactions t
      JOIN wallets w ON t.wallet_id = w.id
      JOIN users u ON w.user_id = u.id
      LEFT JOIN drivers d ON u.id = d.user_id
      WHERE 1=1 ${transactionDateCondition} ${cityCondition}
    `;

    // Execute queries sequentially to avoid connection pool exhaustion
    const revenueResult = await db.query(revenueQuery, params);
    const earningsResult = await db.query(earningsQuery, params);
    const transactionResult = await db.query(transactionQuery, params);

    const revenue = revenueResult.rows[0];
    const earnings = earningsResult.rows[0];
    const transactions = transactionResult.rows[0];

    res.json({
      success: true,
      data: {
        period,
        city,
        dateRange: { start_date, end_date },
        revenue: {
          gross: parseFloat(revenue.gross_revenue || 0),
          completedRides: parseInt(revenue.completed_rides || 0),
          averageRideValue: parseFloat(revenue.avg_ride_value || 0)
        },
        earnings: {
          driverEarnings: parseFloat(earnings.driver_earnings || 0),
          platformFees: parseFloat(earnings.platform_fees || 0),
          finesCollected: parseFloat(earnings.fines_collected || 0)
        },
        transactions: {
          successful: parseInt(transactions.successful_transactions || 0),
          failed: parseInt(transactions.failed_transactions || 0),
          walletRecharges: parseFloat(transactions.wallet_recharges || 0)
        }
      }
    });

  } catch (error) {
    console.error('Financial report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate financial report'
    });
  }
});

/**
 * @route GET /reports/driver-performance
 * @desc Generate driver performance report
 * @access Private (City Admin, Support)
 */
router.get('/driver-performance', tokenVerify, sanitizeInput, validateQuery('driverPerformanceReport'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { 
      period = '30d',
      sort_by = 'total_rides',
      limit = 50 
    } = req.query;

    let dateCondition = '';
    if (period === '7d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '30 days'`;
    } else if (period === '90d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '90 days'`;
    }

    let cityCondition = '';
    let params = [];
    
    if (role === 'city_admin' || role === 'support') {
      cityCondition = 'AND d.city = $1';
      params.push(city);
    }

    let orderBy = 'total_rides DESC';
    if (sort_by === 'completion_rate') {
      orderBy = 'completion_rate DESC';
    } else if (sort_by === 'earnings') {
      orderBy = 'total_earnings DESC';
    } else if (sort_by === 'rating') {
      orderBy = 'avg_rating DESC';
    }

    const performanceQuery = `
      SELECT 
        d.id as driver_id,
        u.full_name as driver_name,
        u.phone_number,
        d.city,
        COUNT(r.id) as total_rides,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
        COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) as cancelled_rides,
        CASE 
          WHEN COUNT(r.id) > 0 THEN 
            ROUND((COUNT(CASE WHEN r.status = 'completed' THEN 1 END)::decimal / COUNT(r.id) * 100), 2)
          ELSE 0 
        END as completion_rate,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as total_earnings,
        COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as avg_fare,
        COUNT(da.id) as total_penalties
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN rides r ON d.id = r.driver_id ${dateCondition}
      LEFT JOIN driver_actions da ON d.id = da.driver_id ${dateCondition}
      WHERE d.status = 'active' ${cityCondition}
      GROUP BY d.id, u.full_name, u.phone_number, d.city
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1}
    `;

    const performanceResult = await db.query(performanceQuery, [...params, limit]);

    res.json({
      success: true,
      data: {
        period,
        city: role === 'city_admin' || role === 'support' ? city : 'All Cities',
        sortBy: sort_by,
        drivers: performanceResult.rows
      }
    });

  } catch (error) {
    console.error('Driver performance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate driver performance report'
    });
  }
});

module.exports = router;