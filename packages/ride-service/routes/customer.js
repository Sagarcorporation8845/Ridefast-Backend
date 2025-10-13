// packages/ride-service/routes/customer.js
const express = require('express');
const router = express.Router();
const { findNearbyDrivers, requestRide, cancelRide } = require('../handlers/customerHandlers'); // Import cancelRide
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
router.post('/rides/request', requestRide);

/**
 * @route POST /customer/rides/:rideId/cancel
 * @desc Cancels an ongoing ride request.
 * @access Private (Customer Only)
 */
router.post('/rides/:rideId/cancel', cancelRide); // Add this new route

module.exports = router;