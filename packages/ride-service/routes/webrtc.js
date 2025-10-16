// packages/ride-service/routes/webrtc.js
const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');

// A simple endpoint to provide the WebRTC configuration to the client apps.
// This is authenticated to ensure only logged-in users can get it.
router.get('/config', customerAuth, (req, res) => {
    res.status(200).json({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ],
    });
});

module.exports = router;