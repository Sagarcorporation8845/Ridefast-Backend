// packages/support-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const driversRoutes = require('./routes/drivers');
const ridesRoutes = require('./routes/rides');
const usersRoutes = require('./routes/users');
const supportRoutes = require('./routes/support');
const reportsRoutes = require('./routes/reports');
const ticketsRoutes = require('./routes/tickets');
const agentRoutes = require('./routes/agent');
const searchRoutes = require('./routes/search'); // Add this line

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API Routes ---
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/drivers', driversRoutes);
app.use('/rides', ridesRoutes);
app.use('/users', usersRoutes);
app.use('/support', supportRoutes);
app.use('/reports', reportsRoutes);
app.use('/tickets', ticketsRoutes);
app.use('/agent', agentRoutes);
app.use('/search', searchRoutes); // Add this line

const PORT = process.env.PORT || 3003;

// Health check route
app.get('/', (req, res) => {
  res.json({
    service: 'RideFast Support Service',
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Support Service Error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start the server after connecting to the database
const startServer = async () => {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`[support-service] Support Service is running on port ${PORT}`);
        console.log(`[support-service] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
};

startServer();