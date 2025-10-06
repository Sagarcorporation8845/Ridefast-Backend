// packages/ride-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { authenticateSocket } = require('./middleware/auth');
const { handleStatusChange, handleLocationUpdate, handleAcceptRide, handleMarkArrived, handleStartRide, handleEndRide } = require('./handlers/driverHandlers');
const db = require('./db'); // CORRECTED: Import the 'db' object directly
const { connectRedis } = require('./services/redisClient');
const customerRoutes = require('./routes/customer');
const { connectionManager } = require('./services/rideManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.RIDE_SERVICE_PORT || 3006;

app.use(express.json());
app.use('/customer', customerRoutes);

function heartbeat() { this.isAlive = true; }

server.on('upgrade', async function upgrade(request, socket, head) {
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

wss.on('connection', async (ws) => {
    // --- RECONNECTION LOGIC ---
    if (ws.driverInfo) {
        try {
            // CORRECTED: Use the 'db' object to query
            const { rows } = await db.query(`SELECT online_status FROM drivers WHERE id = $1`, [ws.driverInfo.driverId]);
            const driverStatus = rows[0]?.online_status;
            const activeRideStates = ['en_route_to_pickup', 'arrived', 'in_ride'];

            if (activeRideStates.includes(driverStatus)) {
                const { rows: rideRows } = await db.query(`SELECT * FROM rides WHERE driver_id = $1 AND status NOT IN ('completed', 'cancelled')`, [ws.driverInfo.driverId]);
                if (rideRows.length > 0) {
                    console.log(`Driver ${ws.driverInfo.driverId} reconnected during an active ride. Sending RESUME_RIDE_STATE.`);
                    ws.send(JSON.stringify({
                        type: 'RESUME_RIDE_STATE',
                        payload: {
                            ride: rideRows[0],
                            currentState: rideRows[0].status
                        }
                    }));
                }
            }
        } catch (error) {
            console.error('Error during reconnection state check:', error);
        }
    }

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            const type = parsedMessage.type;

            if (ws.driverInfo) {
                switch (type) {
                    case 'status_change': return handleStatusChange(ws, parsedMessage);
                    case 'location_update': return handleLocationUpdate(ws, parsedMessage);
                    case 'ACCEPT_RIDE': return handleAcceptRide(ws, parsedMessage);
                    case 'MARK_ARRIVED': return handleMarkArrived(ws, parsedMessage);
                    case 'START_RIDE': return handleStartRide(ws, parsedMessage);
                    case 'END_RIDE': return handleEndRide(ws, parsedMessage);
                }
            }
        } catch (e) {
            console.error('Failed to parse incoming message:', e);
        }
    });

    ws.on('close', async () => {
        if (ws.driverInfo) {
            const driverId = ws.driverInfo.driverId;
            console.log(`Driver disconnected: ${driverId}`);
            connectionManager.activeDriverSockets.delete(driverId);

            // --- START OF FIX for "GHOST" DRIVERS ---
            // Set a timeout to check the driver's status after a grace period.
            setTimeout(async () => {
                // If the driver has reconnected in this time, they will be back in the map.
                if (connectionManager.activeDriverSockets.has(driverId)) {
                    console.log(`Driver ${driverId} reconnected within grace period.`);
                    return;
                }
                
                try {
                    // If they haven't reconnected, check their last known status in the database.
                    const { rows } = await db.query(`SELECT online_status FROM drivers WHERE id = $1`, [driverId]);
                    const lastStatus = rows[0]?.online_status;

                    // Only set them offline if they were just 'online' or 'go_home'.
                    // If they were on an active ride, their status is preserved.
                    if (lastStatus === 'online' || lastStatus === 'go_home') {
                        console.log(`Driver ${driverId} did not reconnect. Setting status to offline.`);
                        // Simulate a status_change message to run the full offline logic.
                        await handleStatusChange(ws, { payload: { status: 'offline' } });
                    }
                } catch (error) {
                    console.error(`Error during disconnected driver cleanup for ${driverId}:`, error);
                }
            }, 30000); // 30-second grace period for reconnection
            // --- END OF FIX ---
        }
        if (ws.userInfo) {
            console.log(`Customer disconnected: ${ws.userInfo.userId}`);
            connectionManager.activeCustomerSockets.delete(ws.userInfo.userId);
        }
    });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
        console.log('A client connection is unresponsive. Terminating.');
        return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

app.get('/', (req, res) => res.status(200).send('Ride-Service is running.'));

const startServer = async () => {
  await db.connectDb(); // Corrected function call
  await connectRedis();
  server.listen(PORT, () => console.log(`Ride-Service is listening on port ${PORT}`));
};

startServer();