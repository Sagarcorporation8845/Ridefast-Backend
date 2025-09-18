// packages/signaling-service/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('redis');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3005;

// --- Redis Configuration ---
const redisClient = createClient({ 
    url: process.env.REDIS_URI || 'redis://localhost:6379' 
});

redisClient.on('error', err => console.log('[signaling-service] Redis Client Error:', err));

// Connect to Redis
(async () => {
    try {
        await redisClient.connect();
        console.log('[signaling-service] Connected to Redis successfully!');
    } catch (error) {
        console.error('[signaling-service] Failed to connect to Redis:', error);
    }
})();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
    res.json({
        service: 'RideFast Signaling Service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        connectedClients: io.engine.clientsCount
    });
});

// REST endpoint for finding nearby drivers (used by other services)
app.post('/nearby-drivers', async (req, res) => {
    try {
        const { pickupLocation, city, vehicleType, radius = 5 } = req.body;
        
        if (!pickupLocation || !city || !vehicleType) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'pickupLocation, city, and vehicleType are required'
            });
        }

        const key = `driver_locations:${city}:${vehicleType}`;
        
        // Use Redis GEOSEARCH to find nearby drivers
        const nearbyDrivers = await redisClient.geoSearch(
            key,
            {
                longitude: pickupLocation.lng,
                latitude: pickupLocation.lat,
                radius: radius,
                unit: 'km'
            },
            { SORT: 'ASC' } // Sort by distance (closest first)
        );

        // Get coordinates for each driver
        const positions = await redisClient.geoPos(key, nearbyDrivers);

        // Get additional driver info for each nearby driver
        const driverDetails = [];
        for (let i = 0; i < nearbyDrivers.length; i++) {
            const driverId = nearbyDrivers[i];
            const pos = positions?.[i];
            const driverStatus = await redisClient.hGetAll(`driver_status:${driverId}`);
            if (driverStatus.status === 'available' && pos) {
                driverDetails.push({
                    driverId,
                    ...driverStatus,
                    coordinates: { lat: parseFloat(pos.latitude), lng: parseFloat(pos.longitude) }
                });
            }
        }

        console.log(`[signaling-service] REST API: Found ${driverDetails.length} nearby drivers for ${vehicleType} in ${city}`);
        
        res.json({
            success: true,
            drivers: driverDetails,
            count: driverDetails.length,
            searchRadius: radius,
            city,
            vehicleType
        });

    } catch (error) {
        console.error('[signaling-service] REST API error finding nearby drivers:', error);
        res.status(500).json({
            error: 'Failed to find nearby drivers',
            message: error.message
        });
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`[signaling-service] Client connected: ${socket.id}`);
    
    // Handle agent authentication
    socket.on('authenticate', (data) => {
        const { userId, role, city } = data;
        
        // Store user info in socket
        socket.userId = userId;
        socket.role = role;
        socket.city = city;
        
        // Join city-specific room
        if (city) {
            socket.join(`city_${city}`);
        }
        
        // Join role-specific room
        if (role) {
            socket.join(`role_${role}`);
        }
        
        console.log(`[signaling-service] User ${userId} authenticated as ${role} in ${city}`);
        
        socket.emit('authenticated', {
            success: true,
            message: 'Successfully authenticated'
        });
    });
    
    // Handle agent status updates
    socket.on('agent_status_update', (data) => {
        const { agentId, status } = data;
        
        // Broadcast to city admins in the same city
        if (socket.city) {
            socket.to(`city_${socket.city}`).emit('agent_status_changed', {
                agentId,
                status,
                timestamp: new Date()
            });
        }
        
        console.log(`[signaling-service] Agent ${agentId} status updated to ${status}`);
    });
    
    // Handle ticket assignment notifications
    socket.on('ticket_assigned', (data) => {
        const { ticketId, agentId, priority } = data;
        
        // Send notification to specific agent
        io.emit('new_ticket_assignment', {
            ticketId,
            agentId,
            priority,
            timestamp: new Date()
        });
        
        console.log(`[signaling-service] Ticket ${ticketId} assigned to agent ${agentId}`);
    });
    
    // Handle city admin alerts
    socket.on('city_admin_alert', (data) => {
        const { city, alertType, message, ticketId } = data;
        
        // Send alert to all city admins in the specific city
        socket.to(`city_${city}`).emit('admin_alert', {
            alertType,
            message,
            ticketId,
            city,
            timestamp: new Date()
        });
        
        console.log(`[signaling-service] Alert sent to city admins in ${city}: ${alertType}`);
    });

    // Handle driver location updates
    socket.on('driverLocationUpdate', async (data) => {
        try {
            const { driverId, city, vehicleType, location } = data;
            
            if (!driverId || !city || !vehicleType || !location || !location.lat || !location.lng) {
                socket.emit('error', { message: 'Invalid location update data' });
                return;
            }

            const key = `driver_locations:${city}:${vehicleType}`;

            // Add the driver's location using Redis geospatial commands
            await redisClient.geoAdd(key, {
                longitude: location.lng,
                latitude: location.lat,
                member: driverId,
            });

            // Set expiry to manage memory (60 seconds)
            await redisClient.expire(key, 60);

            // Store driver status for quick lookup
            await redisClient.hSet(`driver_status:${driverId}`, {
                city,
                vehicleType,
                status: 'available',
                lastUpdate: new Date().toISOString()
            });
            await redisClient.expire(`driver_status:${driverId}`, 60);

            console.log(`[signaling-service] Driver ${driverId} location updated in ${city} for ${vehicleType}`);
            
            socket.emit('locationUpdateConfirmed', { success: true });

        } catch (error) {
            console.error('[signaling-service] Error updating driver location:', error);
            socket.emit('error', { message: 'Failed to update location' });
        }
    });

    // Handle finding nearby drivers
    socket.on('findNearbyDrivers', async (data) => {
        try {
            const { pickupLocation, city, vehicleType, radius = 5 } = data;
            
            if (!pickupLocation || !city || !vehicleType) {
                socket.emit('error', { message: 'Missing required parameters for finding drivers' });
                return;
            }

            const key = `driver_locations:${city}:${vehicleType}`;
            
            // Use Redis GEOSEARCH to find nearby drivers
            const nearbyDrivers = await redisClient.geoSearch(
                key,
                {
                    longitude: pickupLocation.lng,
                    latitude: pickupLocation.lat,
                    radius: radius,
                    unit: 'km'
                },
                { SORT: 'ASC' } // Sort by distance (closest first)
            );

            // Get coordinates for each driver
            const positions = await redisClient.geoPos(key, nearbyDrivers);

            // Get additional driver info for each nearby driver
            const driverDetails = [];
            for (let i = 0; i < nearbyDrivers.length; i++) {
                const driverId = nearbyDrivers[i];
                const pos = positions?.[i];
                const driverStatus = await redisClient.hGetAll(`driver_status:${driverId}`);
                if (driverStatus.status === 'available' && pos) {
                    driverDetails.push({
                        driverId,
                        ...driverStatus,
                        coordinates: { lat: parseFloat(pos.latitude), lng: parseFloat(pos.longitude) }
                    });
                }
            }

            console.log(`[signaling-service] Found ${driverDetails.length} nearby drivers for ${vehicleType} in ${city}`);
            
            socket.emit('nearbyDriversFound', {
                success: true,
                drivers: driverDetails,
                count: driverDetails.length,
                searchRadius: radius
            });

        } catch (error) {
            console.error('[signaling-service] Error finding nearby drivers:', error);
            socket.emit('error', { message: 'Failed to find nearby drivers' });
        }
    });

    // Handle driver status updates (available, busy, offline)
    socket.on('driverStatusUpdate', async (data) => {
        try {
            const { driverId, status } = data;
            
            if (!driverId || !status) {
                socket.emit('error', { message: 'Missing driver ID or status' });
                return;
            }

            // Update driver status
            await redisClient.hSet(`driver_status:${driverId}`, {
                status,
                lastUpdate: new Date().toISOString()
            });
            await redisClient.expire(`driver_status:${driverId}`, 60);

            console.log(`[signaling-service] Driver ${driverId} status updated to ${status}`);
            
            socket.emit('statusUpdateConfirmed', { success: true });

        } catch (error) {
            console.error('[signaling-service] Error updating driver status:', error);
            socket.emit('error', { message: 'Failed to update status' });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`[signaling-service] Client disconnected: ${socket.id}`);
    });
});

// Error handling
server.on('error', (error) => {
    console.error('[signaling-service] Server error:', error);
});

// Start server
server.listen(PORT, () => {
    console.log(`[signaling-service] Signaling Service started on port ${PORT}`);
    console.log(`[signaling-service] Environment: ${process.env.NODE_ENV || 'development'}`);
});