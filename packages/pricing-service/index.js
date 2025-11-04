// packages/pricing-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });
// Add this temporarily for debugging

const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');
const fareRoutes = require('./routes/fares');

const app = express();
const PORT = process.env.PORT || 3007;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/fares', fareRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'Pricing Service',
        status: 'healthy',
        timestamp: new Date()
    });
});

// Start Server
const startServer = async () => {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`[pricing-service] Pricing Service running on port ${PORT}`);
    });
};

startServer();