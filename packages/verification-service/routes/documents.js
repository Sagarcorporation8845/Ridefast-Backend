// packages/verification-service/routes/documents.js
const express = require('express');
const { authenticateAgent } = require('../middleware/auth');
const { getPendingDrivers, getDriverDocuments, updateDocumentStatus } = require('../controllers/verificationController');

const router = express.Router();

// 1. Get a list of drivers pending verification
router.get('/drivers/pending', authenticateAgent, getPendingDrivers);

// 2. Get all documents for a specific driver
router.get('/drivers/:driverId/documents', authenticateAgent, getDriverDocuments);

// 3. Approve or reject a specific document
router.put('/:documentId/status', authenticateAgent, updateDocumentStatus);

module.exports = router;