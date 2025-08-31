// packages/driver-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');

const onboardingRoutes = require('./routes/onboarding');

const app = express();

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Make the 'uploads' directory publicly accessible
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
app.use('/onboarding', onboardingRoutes);

const PORT = process.env.DRIVER_SERVICE_PORT || 3002;

// Health check route
app.get('/', (req, res) => {
  res.send('Driver Service is healthy and running!');
});

// Start the server after connecting to the database
const startServer = async () => {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`Driver Service is running on port ${PORT}`);
    });
};

startServer();
