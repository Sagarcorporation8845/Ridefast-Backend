// packages/maps-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');
const mapsRoutes = require('./routes/maps');

const app = express();
const PORT = process.env.PORT || 3008;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/maps', mapsRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'Maps Service',
        status: 'healthy',
        timestamp: new Date()
    });
});

const startServer = async () => {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`[maps-service] Maps Service running on port ${PORT}`);
    });
};

startServer();