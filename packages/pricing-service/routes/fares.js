// packages/pricing-service/routes/fares.js
const express = require('express');
const { calculateFare } = require('../controllers/fareController');
const tokenVerify = require('../middleware/token-verify');

const router = express.Router();

// This endpoint is protected to ensure only logged-in users can request fares.
router.post('/estimate', tokenVerify, calculateFare);

module.exports = router;