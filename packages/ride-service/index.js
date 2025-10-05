// packages/ride-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { authenticateSocket } = require('./middleware/auth');
const { handleStatusChange, handleLocationUpdate, handleAcceptRide } = require('./handlers/driverHandlers');
const { connectDb } = require('./db');
const { connectRedis } = require('./services/redisClient');
const customerRoutes = require('./routes/customer');
const { connectionManager } = require('./services/rideManager'); // Import the connection manager

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true }); // We'll handle the upgrade manually

const PORT = process.env.RIDE_SERVICE_PORT || 3006;

app.use(express.json());
app.use('/customer', customerRoutes);

function heartbeat() {
  this.isAlive = true;
}

// --- UPDATED WEBSOCKET CONNECTION HANDLING ---
server.on('upgrade', async function upgrade(request, socket, head) {
    // This authenticateSocket function needs to be updated as described below
    const { isAuthenticated, role, userId, driverId, city } = await authenticateSocket(request);

    if (!isAuthenticated) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, function done(ws) {
        ws.isAlive = true;
        ws.on('pong', heartbeat);

        if (role === 'driver') {
            ws.driverInfo = { driverId, userId, city };
            connectionManager.activeDriverSockets.set(driverId, ws);
            console.log(`Driver connected: ${driverId} in ${city}`);
        } else if (role === 'customer') {
            ws.userInfo = { userId };
            connectionManager.activeCustomerSockets.set(userId, ws);
            console.log(`Customer connected: ${userId}`);
        }

        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            const type = parsedMessage.type;

            if (ws.driverInfo) { // Driver-specific messages
                switch (type) {
                    case 'status_change':
                        handleStatusChange(ws, parsedMessage);
                        break;
                    case 'location_update':
                        handleLocationUpdate(ws, parsedMessage);
                        break;
                    case 'ACCEPT_RIDE':
                        handleAcceptRide(ws, parsedMessage); // New handler
                        break;
                }
            }
            // Add customer-specific message handling here if needed in the future
            
        } catch (e) {
            console.error('Failed to parse incoming message:', message.toString(), e);
        }
    });

    ws.on('close', () => {
        if (ws.driverInfo) {
            console.log(`Driver disconnected: ${ws.driverInfo.driverId}`);
            connectionManager.activeDriverSockets.delete(ws.driverInfo.driverId);
            handleStatusChange(ws, { payload: { status: 'offline' } });
        }
        if (ws.userInfo) {
            console.log(`Customer disconnected: ${ws.userInfo.userId}`);
            connectionManager.activeCustomerSockets.delete(ws.userInfo.userId);
        }
    });
});

// Interval for heartbeat
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 20000);

app.get('/', (req, res) => res.status(200).send('Ride-Service is running.'));

const startServer = async () => {
  await connectDb();
  await connectRedis();
  server.listen(PORT, () => console.log(`Ride-Service is listening on port ${PORT}`));
};

startServer();