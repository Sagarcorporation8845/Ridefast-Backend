const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') }); 

// --- 1. IMPORT YOUR DB CONNECTION & SCHEDULER ---
const { connectDb } = require('./db'); // Import the connectDb function
const { startScheduler } = require('./services/scheduler');
// ---

const configRoutes = require('./routes/config');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3004;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: {
            type: 'RATE_LIMIT_ERROR',
            message: 'Too many requests, please try again later',
            timestamp: new Date()
        }
    }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'admin-service',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

// Routes
app.use('/admin/agents', require('./routes/agents'));
app.use('/admin/tickets', require('./routes/tickets'));
app.use('/admin/cities', require('./routes/cities')); 
app.use('/admin/dashboard', dashboardRoutes);
app.use('/admin/config', configRoutes); 

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: {
            type: 'RESOURCE_NOT_FOUND',
            message: 'Endpoint not found',
            timestamp: new Date()
        }
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    
    res.status(500).json({
        error: {
            type: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
            timestamp: new Date()
        }
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[admin-service] SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[admin-service] SIGINT received, shutting down gracefully');
    process.exit(0);
});

// --- 2. CREATE A START SERVER FUNCTION ---
// We wrap app.listen in a function that connects to the DB first
const startServer = async () => {
    try {
        // First, connect to the database
        await connectDb();
        console.log('[admin-service] Database connected successfully.');
        
        // Second, start the scheduler (which needs the DB)
        startScheduler(); 
        
        // Finally, start the web server
        app.listen(PORT, () => {
            console.log(`[admin-service] Admin Service started on port ${PORT}`);
            console.log(`[admin-service] Environment: ${process.env.NODE_ENV || 'development'}`);
        });

    } catch (err) {
        console.error('❌ FATAL: [admin-service] Failed to start server.', err);
        process.exit(1);
    }
};

// --- 3. CALL THE FUNCTION TO START EVERYTHING ---
startServer();