// packages/support-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');

// Import routes
const authRoutes = require('./routes/auth');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Routes ---
app.use('/auth', authRoutes);

const PORT = process.env.SUPPORT_SERVICE_PORT || 3003;

// Health check route
app.get('/', (req, res) => {
  res.send('Support Service is healthy and running!');
});

// Start the server after connecting to the database
const startServer = async () => {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`[support-service] Support Service is running on port ${PORT}`);
    });
};

startServer();
