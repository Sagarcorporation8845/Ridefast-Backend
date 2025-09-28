// packages/ride-service/routes/customer.js
const express = require('express');
const router = express.Router();
const { findNearbyDrivers } = require('../handlers/customerHandlers');
const customerAuth = require('../middleware/customerAuth');

// All routes in this file are for authenticated customers
router.use(customerAuth);

/**
 * @route GET /customer/nearby-drivers
 * @desc Gets nearby available drivers, categorized by vehicle type,
 * using a dynamic search radius.
 * @access Private (Customer Only)
 */
router.get('/nearby-drivers', findNearbyDrivers);

module.exports = router;