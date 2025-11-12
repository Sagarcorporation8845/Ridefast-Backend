const express = require('express');
// This line now correctly imports the function from the file above
const { authenticateDriver } = require('../middleware/auth'); 
const { 
    getSubscriptionInfo, 
    payForSubscription 
} = require('../controllers/subscriptionController');

const router = express.Router();

// This line will now work because authenticateDriver is a valid function
router.use(authenticateDriver); 

/**
 * @route GET /api/driver/subscription-info
 */
router.get('/subscription-info', getSubscriptionInfo);

/**
 * @route POST /api/driver/pay-subscription
 */
router.post('/pay-subscription', payForSubscription);

module.exports = router;