// packages/admin-service/routes/reports.js
const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth'); // Your central_admin auth
const {
    getRideStatistics,
    getRegistrationSummary,
    getRevenueOverTime
} = require('../controllers/reportsController');

const router = express.Router();
// 1. First, check that the user has a valid token
router.use(authenticateToken); 
// 2. Second, check that the user's role is 'central_admin'
router.use(requireRole(['central_admin']));
// Route for the "Ride Statistics" cards
router.get('/statistics', getRideStatistics);

// Route for the "Driver & Registration" cards
router.get('/registration', getRegistrationSummary);

// Route for the "Revenue Over Time" graph
router.get('/revenue-over-time', getRevenueOverTime);

module.exports = router;