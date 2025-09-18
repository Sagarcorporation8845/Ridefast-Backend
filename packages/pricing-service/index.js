// packages/pricing-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 3007;
const LOCATION_SERVICE_URL = process.env.LOCATION_SERVICE_URL || 'http://localhost:3006';

// Pricing configuration - can be moved to database later
const PRICING_CONFIG = {
    bike: {
        baseFare: 20,
        perKmRate: 8,
        perMinuteRate: 1,
        minimumFare: 25
    },
    auto: {
        baseFare: 30,
        perKmRate: 12,
        perMinuteRate: 1.5,
        minimumFare: 40
    },
    cab: {
        baseFare: 50,
        perKmRate: 15,
        perMinuteRate: 2,
        minimumFare: 80
    }
};

// --- Middleware ---
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
    credentials: true
}));
app.use(express.json());

// --- Helper Functions ---

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
}

// Get route information from location service
async function getRouteInfo(origin, destination) {
    try {
        const response = await axios.post(`${LOCATION_SERVICE_URL}/directions`, {
            origin: `${origin.lat},${origin.lng}`,
            destination: `${destination.lat},${destination.lng}`,
            mode: 'driving'
        });

        if (response.data.status === 'OK' && response.data.routes.length > 0) {
            const route = response.data.routes[0];
            const leg = route.legs[0];
            
            return {
                distance: leg.distance.value / 1000, // Convert to kilometers
                duration: leg.duration.value / 60, // Convert to minutes
                polyline: route.overview_polyline.points
            };
        } else {
            throw new Error('No route found');
        }
    } catch (error) {
        console.error('[pricing-service] Error fetching route info:', error.message);
        throw error;
    }
}

// Calculate fare based on vehicle type, distance, and duration
function calculateFare(vehicleType, distance, duration) {
    const config = PRICING_CONFIG[vehicleType];
    if (!config) {
        throw new Error(`Unsupported vehicle type: ${vehicleType}`);
    }

    const baseFare = config.baseFare;
    const distanceFare = distance * config.perKmRate;
    const timeFare = duration * config.perMinuteRate;
    
    const totalFare = baseFare + distanceFare + timeFare;
    const finalFare = Math.max(totalFare, config.minimumFare);

    return {
        baseFare,
        distanceFare: Math.round(distanceFare * 100) / 100,
        timeFare: Math.round(timeFare * 100) / 100,
        totalFare: Math.round(finalFare * 100) / 100,
        breakdown: {
            base: baseFare,
            distance: Math.round(distanceFare * 100) / 100,
            time: Math.round(timeFare * 100) / 100,
            minimum: config.minimumFare
        }
    };
}

// --- Routes ---

// Health check route
app.get('/', (req, res) => {
    res.json({
        service: 'RideFast Pricing Service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            estimate: 'POST /estimate'
        },
        supportedVehicles: Object.keys(PRICING_CONFIG)
    });
});

// Fare estimation endpoint
app.post('/estimate', async (req, res) => {
    try {
        const { pickup, dropoff, vehicleType } = req.body;

        // Validate required parameters
        if (!pickup || !pickup.lat || !pickup.lng) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'pickup coordinates (lat, lng) are required'
            });
        }

        if (!dropoff || !dropoff.lat || !dropoff.lng) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'dropoff coordinates (lat, lng) are required'
            });
        }

        if (!vehicleType || !PRICING_CONFIG[vehicleType]) {
            return res.status(400).json({
                error: 'Invalid vehicle type',
                message: `Supported vehicle types: ${Object.keys(PRICING_CONFIG).join(', ')}`
            });
        }

        console.log(`[pricing-service] Estimating fare for ${vehicleType} from (${pickup.lat}, ${pickup.lng}) to (${dropoff.lat}, ${dropoff.lng})`);

        // Get route information from location service
        const routeInfo = await getRouteInfo(pickup, dropoff);

        // Calculate fare
        const fareCalculation = calculateFare(vehicleType, routeInfo.distance, routeInfo.duration);

        // Prepare response
        const response = {
            success: true,
            vehicleType,
            route: {
                distance: Math.round(routeInfo.distance * 100) / 100, // km
                duration: Math.round(routeInfo.duration * 100) / 100, // minutes
                polyline: routeInfo.polyline
            },
            fare: fareCalculation,
            pickup: {
                lat: pickup.lat,
                lng: pickup.lng
            },
            dropoff: {
                lat: dropoff.lat,
                lng: dropoff.lng
            },
            estimatedAt: new Date().toISOString()
        };

        res.json(response);

    } catch (error) {
        console.error('[pricing-service] Fare estimation error:', error.message);
        
        res.status(500).json({
            error: 'Fare estimation failed',
            message: error.message || 'Unable to calculate fare'
        });
    }
});

// Get pricing configuration endpoint (for admin/debugging)
app.get('/pricing-config', (req, res) => {
    res.json({
        success: true,
        pricing: PRICING_CONFIG,
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('[pricing-service] Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`[pricing-service] Pricing Service started on port ${PORT}`);
    console.log(`[pricing-service] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[pricing-service] Location Service URL: ${LOCATION_SERVICE_URL}`);
});
