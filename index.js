// ridefast-backend/index.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const { serve, setup } = require('./swagger');
const { connectCentralDb, getConnectionStatus } = require('./shared/db');
const { monitor } = require('./shared/dbMonitor');

const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 3000; 

// The internal URLs for your microservices.
const USER_SERVICE_URL = 'http://localhost:3001';
const DRIVER_SERVICE_URL = 'http://localhost:3002';
const SUPPORT_SERVICE_URL = 'http://localhost:3003';
const ADMIN_SERVICE_URL = 'http://localhost:3004';
const VERIFICATION_SERVICE_URL = 'http://localhost:3005'; // Add this line
const RIDE_SERVICE_URL = 'http://localhost:3006';


// --- Middleware ---
app.use(cors());
app.use(express.static('public'));

// Swagger API Documentation
app.use('/api-docs', serve, setup);

// Database status endpoint
app.get('/db-status', (req, res) => {
    res.json(monitor.getHealthCheck());
});

// Detailed database statistics
app.get('/db-stats', (req, res) => {
    res.json(monitor.getStats());
});

// A simple health check for the gateway itself
app.get('/', (req, res) => {
    const dbStatus = getConnectionStatus();
    res.json({
        message: 'RideFast API Gateway is running and healthy',
        documentation: '/api-docs',
        database: {
            status: dbStatus.isConnected ? 'connected' : 'disconnected',
            connections: `${dbStatus.totalConnections - dbStatus.idleConnections}/${dbStatus.totalConnections} active`
        },
        services: {
            'user-service': '/user-service',
            'driver-service': '/driver-service', 
            'support-service': '/support-service',
            'admin-service': '/admin-service',
            'verification-service': '/verification-service',
            'ride-service': '/ride-service'

        },
        timestamp: new Date().toISOString()
    });
});

// --- Proxies ---

// Proxy requests for the User Service
app.use('/user-service', createProxyMiddleware({
    target: USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/user-service': '', // remove the prefix
    },
}));

// Proxy requests for the Driver Service
app.use('/driver-service', createProxyMiddleware({
    target: DRIVER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/driver-service': '', // remove the prefix
    },
}));

// Proxy requests for the Support Service
app.use('/support-service', createProxyMiddleware({
    target: SUPPORT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/support-service': '', // remove the prefix
    },
}));

// Proxy requests for the Admin Service
app.use('/admin-service', createProxyMiddleware({
    target: ADMIN_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/admin-service': '', // remove the prefix
    },
}));

// Proxy requests for the Signaling Service (WebSocket)
app.use('/verification-service', createProxyMiddleware({
    target: VERIFICATION_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/verification-service': '', // remove the prefix
    },
}));


// --- Start the Server ---
const startServer = async () => {
    // Initialize central database pool
    console.log('[api-gateway] Initializing central database pool...');
    await connectCentralDb();
    
    // Start database monitoring
    monitor.startMonitoring(30000); // Monitor every 30 seconds
    
    app.listen(PORT, () => {
        console.log(`[api-gateway] API Gateway started on port ${PORT}`);
        console.log(`[api-gateway] Database status: /db-status`);
        console.log(`[api-gateway] Database stats: /db-stats`);
    });
};

startServer();
