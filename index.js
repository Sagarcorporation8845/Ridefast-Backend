// ridefast-backend/index.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// --- Configuration ---
// The gateway will run on port 3000 by default in development.
// In production, your VPS/PM2 will manage the port (likely port 80).
const PORT = process.env.PORT || 3000; 

// The internal URLs for your microservices. The gateway will forward requests to these.
const USER_SERVICE_URL = 'http://localhost:3001';
const DRIVER_SERVICE_URL = 'http://localhost:3002';

// --- Middleware ---

// Enable Cross-Origin Resource Sharing (CORS) for all routes
app.use(cors());

// A simple health check for the gateway itself
app.get('/', (req, res) => {
    res.send('API Gateway is running and healthy.');
});

// --- Proxies ---

// Proxy requests for the User Service
// Any request to /user-service/* will be forwarded to http://localhost:3001/*
app.use('/user-service', createProxyMiddleware({
    target: USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/user-service': '', // remove the /user-service prefix before forwarding
    },
}));

// Proxy requests for the Driver Service
// Any request to /driver-service/* will be forwarded to http://localhost:3002/*
app.use('/driver-service', createProxyMiddleware({
    target: DRIVER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/driver-service': '', // remove the /driver-service prefix before forwarding
    },
}));


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`[api-gateway] API Gateway started on port ${PORT}`);
});