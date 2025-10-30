const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
    getOverviewStats,
    getRideVolume,
    getActiveUserSummary,
    getDriverPayouts,
    getPendingVerifications,
    getTicketSummary,
    getTopCities,
    sendBroadcast,
    getEscalatedTickets
} = require('../controllers/dashboardController');

const router = express.Router();

//verify the user's token and fetch their profile
router.use(authenticateToken);
router.use(requireRole(['central_admin']));

// --- Dashboard Routes ---
router.get('/summary-overview', getOverviewStats);
router.get('/ride-volume', getRideVolume);
router.get('/user-summary', getActiveUserSummary);
router.get('/payout-summary', getDriverPayouts);
router.get('/pending-verifications', getPendingVerifications);
router.get('/ticket-summary', getTicketSummary);
router.get('/top-cities', getTopCities);
router.get('/escalated-tickets', getEscalatedTickets);
router.post('/broadcast', sendBroadcast);

module.exports = router;