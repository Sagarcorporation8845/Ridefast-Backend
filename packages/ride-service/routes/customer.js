// packages/ride-service/routes/customer.js
const express = require('express');
const router = express.Router();
const { findNearbyDrivers, requestRide } = require('../handlers/customerHandlers'); // Import requestRide
const customerAuth = require('../middleware/customerAuth');

router.use(customerAuth);

/**
 * @route GET /customer/nearby-drivers
 * @desc Gets nearby available drivers.
 */
router.get('/nearby-drivers', findNearbyDrivers);

/**
 * @route POST /customer/rides/request
 * @desc Initiates a new ride request after fare confirmation.
 * @access Private (Customer Only)
 */
router.post('/rides/request', requestRide); // Add this new route

module.exports = router;