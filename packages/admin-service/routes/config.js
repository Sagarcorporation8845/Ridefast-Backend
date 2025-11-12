// packages/admin-service/routes/config.js
const express = require('express');

// --- THIS IS THE FIX ---
// Import the two correct functions from your auth.js file
const { authenticateToken, requireRole } = require('../middleware/auth'); 
// --- END OF FIX ---

const {
    getFareRates,
    updateFareRate,
    getSubscriptionFees,
    updateSubscriptionFee
} = require('../controllers/configController');

const router = express.Router();

// --- THIS IS THE FIX ---
// Apply the middleware in sequence
// 1. Verify the token exists and is valid
router.use(authenticateToken); 
// 2. Ensure the user has the 'central_admin' role
router.use(requireRole(['central_admin']));
// --- END OF FIX ---


// --- Vehicle Fare Rates ---
router.get('/fare-rates', getFareRates);
router.put('/fare-rates/:id', updateFareRate);

// --- Driver Subscription Fees ---
router.get('/subscription-fees', getSubscriptionFees);
router.put('/subscription-fees/:city_name', updateSubscriptionFee);

module.exports = router;