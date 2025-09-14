// packages/signaling-service/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
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

const PORT = process.env.SIGNALING_SERVICE_PORT || 3005;

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