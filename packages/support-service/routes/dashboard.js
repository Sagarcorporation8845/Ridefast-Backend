// packages/support-service/routes/dashboard.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, sanitizeInput } = require('../middleware/queryValidation');
const { isCityRole } = require('../utils/role-utils');

const router = express.Router();

/**
 * @route GET /dashboard/overview
 * @desc Get dashboard overview metrics for city admin/support
 * @access Private (City Admin, Support)
 */
router.get('/overview', tokenVerify, sanitizeInput, validateQuery('dashboardOverview'), async (req, res) => {
  try {
    const { role, city } = req.user;

    // --- FIX: Correctly define conditions and params for all queries ---
    const cityCondition = isCityRole(role) ? `AND d.city = $1` : '';
    const ticketCityCondition = isCityRole(role) ? `WHERE city = $1` : '';
    const ticketCityConditionWithAnd = isCityRole(role) ? `AND city = $1` : '';
    const params = isCityRole(role) ? [city] : [];
    
    const today = new Date().toISOString().split('T')[0];
    
    // Total active drivers
    const activeDriversQuery = `
      SELECT COUNT(*) as count 
      FROM drivers d 
      WHERE d.status = 'active' ${cityCondition}
    `;
    
    // Today's rides
    const todayRidesQuery = `
      SELECT COUNT(*) as count 
      FROM rides r 
      LEFT JOIN drivers d ON r.driver_id = d.id 
      WHERE DATE(r.created_at) = $${params.length + 1} ${cityCondition}
    `;
    
    // Pending driver verifications
    const pendingDriversQuery = `
      SELECT COUNT(*) as count 
      FROM drivers d 
      WHERE d.status = 'pending_verification' ${cityCondition}
    `;
    
    // --- MODIFICATION START: Add BOTH open and unassigned tickets ---
    // All open tickets in the city
    const openTicketsQuery = `
      SELECT COUNT(*) as count 
      FROM support_tickets 
      WHERE status = 'open' ${ticketCityConditionWithAnd}
    `;

    // Unassigned tickets in the city
    const unassignedTicketsQuery = `
      SELECT COUNT(*) as count 
      FROM support_tickets
      WHERE status = 'open' AND assigned_agent_id IS NULL ${ticketCityConditionWithAnd}
    `;
    // --- MODIFICATION END ---
    
    // Revenue today
    const todayRevenueQuery = `
      SELECT COALESCE(SUM(r.fare), 0) as revenue 
      FROM rides r 
      LEFT JOIN drivers d ON r.driver_id = d.id 
      WHERE DATE(r.created_at) = $${params.length + 1} 
      AND r.status = 'completed' ${cityCondition}
    `;

    // Execute all queries
    const activeDrivers = await db.query(activeDriversQuery, params);
    const todayRides = await db.query(todayRidesQuery, [...params, today]);
    const pendingDrivers = await db.query(pendingDriversQuery, params);
    const openTickets = await db.query(openTicketsQuery, isCityRole(role) ? [city] : []);
    const unassignedTickets = await db.query(unassignedTicketsQuery, isCityRole(role) ? [city] : []);
    const todayRevenue = await db.query(todayRevenueQuery, [...params, today]);

    // Get recent activities
    const recentActivitiesQuery = `
      SELECT 
        'ride' as type,
        r.id,
        r.status,
        r.created_at,
        u.full_name as customer_name,
        du.full_name as driver_name
      FROM rides r
      JOIN users u ON r.customer_id = u.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      WHERE DATE(r.created_at) = $${params.length + 1} ${cityCondition}
      ORDER BY r.created_at DESC
      LIMIT 10
    `;

    const recentActivities = await db.query(recentActivitiesQuery, [...params, today]);

    res.json({
      success: true,
      data: {
        metrics: {
          activeDrivers: parseInt(activeDrivers.rows[0].count),
          todayRides: parseInt(todayRides.rows[0].count),
          pendingDrivers: parseInt(pendingDrivers.rows[0].count),
          openTickets: parseInt(openTickets.rows[0].count),
          unassignedTickets: parseInt(unassignedTickets.rows[0].count),
          todayRevenue: parseFloat(todayRevenue.rows[0].revenue)
        },
        recentActivities: recentActivities.rows,
        city: isCityRole(role) ? city : 'All Cities'
      }
    });

  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
});

/**
 * @route GET /dashboard/analytics
 * @desc Get analytics data for charts and graphs
 * @access Private (City Admin, Support)
 */
router.get('/analytics', tokenVerify, sanitizeInput, validateQuery('dashboardAnalytics'), async (req, res) => {
  try {
    const { role, city } = req.user;
    const { period = '7d' } = req.query;

    const cityCondition = isCityRole(role) ? `AND d.city = $1` : '';
    const params = isCityRole(role) ? [city] : [];

    let dateCondition = '';
    if (period === '7d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      dateCondition = `AND r.created_at >= NOW() - INTERVAL '30 days'`;
    }

    // Daily rides trend
    const ridesAnalyticsQuery = `
      SELECT 
        DATE(r.created_at) as date,
        COUNT(*) as rides,
        COALESCE(SUM(r.fare), 0) as revenue
      FROM rides r
      JOIN drivers d ON r.driver_id = d.id
      WHERE r.status = 'completed' ${dateCondition} ${cityCondition}
      GROUP BY DATE(r.created_at)
      ORDER BY date DESC
    `;

    // Ride status distribution
    const statusDistributionQuery = `
      SELECT 
        r.status,
        COUNT(*) as count
      FROM rides r
      JOIN drivers d ON r.driver_id = d.id
      WHERE 1=1 ${dateCondition} ${cityCondition}
      GROUP BY r.status
    `;

    // Execute queries
    const ridesAnalytics = await db.query(ridesAnalyticsQuery, params);
    const statusDistribution = await db.query(statusDistributionQuery, params);

    res.json({
      success: true,
      data: {
        ridesAnalytics: ridesAnalytics.rows,
        statusDistribution: statusDistribution.rows,
        period
      }
    });

  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data'
    });
  }
});

module.exports = router;