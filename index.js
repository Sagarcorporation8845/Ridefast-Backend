// ridefast-backend/index.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 80; 

// The internal URLs for your microservices.
const USER_SERVICE_URL = 'http://localhost:3001';
const DRIVER_SERVICE_URL = 'http://localhost:3002';
const SUPPORT_SERVICE_URL = 'http://localhost:3003'; // Added new service URL

// --- Middleware ---
app.use(cors());

// A simple health check for the gateway itself
app.get('/', (req, res) => {
    res.send('API Gateway is running and healthy.');
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

// --- NEW PROXY ---
// Proxy requests for the Support Service
app.use('/support-service', createProxyMiddleware({
    target: SUPPORT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/support-service': '', // remove the prefix
    },
}));


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`[api-gateway] API Gateway started on port ${PORT}`);
});
