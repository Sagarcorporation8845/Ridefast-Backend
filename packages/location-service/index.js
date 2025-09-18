// packages/location-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 3006;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

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
        service: 'RideFast Location Service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            directions: 'POST /directions',
            distanceMatrix: 'POST /distance-matrix'
        }
    });
});

// Directions endpoint - acts as a secure proxy to Google Maps Directions API
app.post('/directions', async (req, res) => {
    try {
        const { origin, destination, mode = 'driving', alternatives = false } = req.body;

        // Validate required parameters
        if (!origin || !destination) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'Both origin and destination are required'
            });
        }

        if (!GOOGLE_MAPS_API_KEY) {
            return res.status(500).json({
                error: 'Configuration error',
                message: 'Google Maps API key not configured'
            });
        }

        // Prepare Google Maps API request
        const googleMapsUrl = 'https://maps.googleapis.com/maps/api/directions/json';
        const params = {
            origin,
            destination,
            mode,
            alternatives,
            key: GOOGLE_MAPS_API_KEY
        };

        console.log(`[location-service] Fetching directions from ${origin} to ${destination}`);

        // Make request to Google Maps API
        const response = await axios.get(googleMapsUrl, { params });

        // Forward the complete response from Google Maps
        res.json(response.data);

    } catch (error) {
        console.error('[location-service] Directions API error:', error.message);
        
        if (error.response) {
            // Google Maps API error
            res.status(error.response.status).json({
                error: 'Google Maps API error',
                message: error.response.data?.error_message || 'Unknown API error',
                status: error.response.data?.status || 'UNKNOWN_ERROR'
            });
        } else {
            // Network or other error
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to fetch directions'
            });
        }
    }
});

// Distance Matrix endpoint - for finding nearest drivers
app.post('/distance-matrix', async (req, res) => {
    try {
        const { origins, destination, mode = 'driving' } = req.body;

        // Validate required parameters
        if (!origins || !Array.isArray(origins) || origins.length === 0) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'origins must be a non-empty array'
            });
        }

        if (!destination) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'destination is required'
            });
        }

        if (!GOOGLE_MAPS_API_KEY) {
            return res.status(500).json({
                error: 'Configuration error',
                message: 'Google Maps API key not configured'
            });
        }

        // Prepare Google Maps API request
        const googleMapsUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';
        const params = {
            origins: origins.join('|'), // Google Maps expects pipe-separated origins
            destinations: destination,
            mode,
            units: 'metric',
            key: GOOGLE_MAPS_API_KEY
        };

        console.log(`[location-service] Fetching distance matrix for ${origins.length} origins to ${destination}`);

        // Make request to Google Maps API
        const response = await axios.get(googleMapsUrl, { params });

        // Forward the complete response from Google Maps
        res.json(response.data);

    } catch (error) {
        console.error('[location-service] Distance Matrix API error:', error.message);
        
        if (error.response) {
            // Google Maps API error
            res.status(error.response.status).json({
                error: 'Google Maps API error',
                message: error.response.data?.error_message || 'Unknown API error',
                status: error.response.data?.status || 'UNKNOWN_ERROR'
            });
        } else {
            // Network or other error
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to fetch distance matrix'
            });
        }
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('[location-service] Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`[location-service] Location Service started on port ${PORT}`);
    console.log(`[location-service] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[location-service] Google Maps API configured: ${GOOGLE_MAPS_API_KEY ? 'Yes' : 'No'}`);
});
