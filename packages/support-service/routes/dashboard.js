// packages/support-service/routes/dashboard.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, sanitizeInput } = require('../middleware/queryValidation');
const { isCityRole } = require('../utils/role-utils');

const router = express.Router();

/**
 * @route GET /dashboard/overview
 * @desc Get dashboard overview metrics tailored to the user's role.
 * @access Private (City Admin, Support)
 */
router.get('/overview', tokenVerify, sanitizeInput, validateQuery('dashboardOverview'), async (req, res) => {
  try {
    const { userId, role, city } = req.user; // Use userId, which is the standardized agent ID
    const today = new Date().toISOString().split('T')[0];
    let metrics = {};

    // --- DASHBOARD FOR CITY ADMIN ---
    if (role === 'city_admin') {
      const adminQueries = {
        activeDrivers: `SELECT COUNT(*) as count FROM drivers WHERE status = 'active' AND LOWER(city) = LOWER($1)`,
        todayCompletedRides: `
          SELECT COUNT(*) as count 
          FROM rides r
          JOIN drivers d ON r.driver_id = d.id
          WHERE r.status = 'completed' AND LOWER(d.city) = LOWER($1) AND DATE(r.created_at) = $2`,
        unassignedTickets: `SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open' AND assigned_agent_id IS NULL AND LOWER(city) = LOWER($1)`,
        pendingDrivers: `SELECT COUNT(*) as count FROM drivers WHERE status = 'pending_verification' AND LOWER(city) = LOWER($1)`,
        todayResolvedTickets: `SELECT COUNT(*) as count FROM support_tickets WHERE status = 'resolved' AND LOWER(city) = LOWER($1) AND DATE(resolved_at) = $2`,
        todayNewTickets: `SELECT COUNT(*) as count FROM support_tickets WHERE LOWER(city) = LOWER($1) AND DATE(created_at) = $2`,
      };

      const [
        activeDriversRes,
        todayRidesRes,
        unassignedTicketsRes,
        pendingDriversRes,
        todayResolvedRes,
        todayNewTicketsRes
      ] = await Promise.all([
        db.query(adminQueries.activeDrivers, [city]),
        db.query(adminQueries.todayCompletedRides, [city, today]),
        db.query(adminQueries.unassignedTickets, [city]),
        db.query(adminQueries.pendingDrivers, [city]),
        db.query(adminQueries.todayResolvedTickets, [city, today]),
        db.query(adminQueries.todayNewTickets, [city, today])
      ]);

      metrics = {
        activeDrivers: parseInt(activeDriversRes.rows[0].count, 10),
        todayCompletedRides: parseInt(todayRidesRes.rows[0].count, 10),
        unassignedTickets: parseInt(unassignedTicketsRes.rows[0].count, 10),
        pendingDrivers: parseInt(pendingDriversRes.rows[0].count, 10),
        todayResolvedTickets: parseInt(todayResolvedRes.rows[0].count, 10),
        todayNewTickets: parseInt(todayNewTicketsRes.rows[0].count, 10),
      };

    // --- DASHBOARD FOR SUPPORT AGENT ---
    } else if (role === 'support') {
      const supportQueries = {
        pendingDrivers: `SELECT COUNT(*) as count FROM drivers WHERE status = 'pending_verification' AND LOWER(city) = LOWER($1)`,
        openTicketsInCity: `SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open' AND LOWER(city) = LOWER($1)`,
        unassignedTicketsInCity: `SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open' AND assigned_agent_id IS NULL AND LOWER(city) = LOWER($1)`,
        myResolvedTickets: `SELECT COUNT(*) as count FROM support_tickets WHERE resolved_at IS NOT NULL AND assigned_agent_id = $1` // Total resolved by this specific agent
      };

      const [
        pendingDriversRes,
        openTicketsRes,
        unassignedTicketsRes,
        myResolvedRes
      ] = await Promise.all([
        db.query(supportQueries.pendingDrivers, [city]),
        db.query(supportQueries.openTicketsInCity, [city]),
        db.query(supportQueries.unassignedTicketsInCity, [city]),
        db.query(supportQueries.myResolvedTickets, [userId])
      ]);
      
      metrics = {
        pendingDriverVerifications: parseInt(pendingDriversRes.rows[0].count, 10),
        openTicketsInCity: parseInt(openTicketsRes.rows[0].count, 10),
        unassignedTicketsInCity: parseInt(unassignedTicketsRes.rows[0].count, 10),
        myTotalResolvedTickets: parseInt(myResolvedRes.rows[0].count, 10),
      };
    }

    res.json({
      success: true,
      data: {
        role: role,
        city: city,
        metrics: metrics,
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