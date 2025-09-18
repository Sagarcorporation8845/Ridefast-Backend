// packages/ride-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');

const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 3008;

// --- Middleware ---
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
    credentials: true
}));
app.use(express.json());

// --- Routes ---

// Health check route
app.get('/', (req, res) => {
    res.json({
        service: 'RideFast Ride Service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// --- Start ---
app.listen(PORT, () => {
    console.log(`[ride-service] Ride Service started on port ${PORT}`);
    console.log(`[ride-service] Environment: ${process.env.NODE_ENV || 'development'}`);
});
