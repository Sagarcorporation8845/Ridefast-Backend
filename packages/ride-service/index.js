// packages/ride-service/index.js
require('newrelic');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { authenticateSocket } = require('./middleware/auth');
const { handleStatusChange, handleLocationUpdate, handleAcceptRide, handleMarkArrived, handleStartRide, handleEndRide } = require('./handlers/driverHandlers');
const db = require('./db');
const { redisClient, connectRedis } = require('./services/redisClient');
const customerRoutes = require('./routes/customer');
const webrtcRoutes = require('./routes/webrtc'); // ADD THIS LINE
const { connectionManager, forwardSignalingMessage } = require('./services/rideManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.RIDE_SERVICE_PORT || 3006;

app.use(express.json());
app.use('/customer', customerRoutes);
app.use('/webrtc', webrtcRoutes); // ADD THIS LINE

const rideLocationBroadcasters = new Map();

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
    if (ws.driverInfo) {
        try {
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
            const { type, payload } = parsedMessage;

            // ---  CALL SIGNALING LOGIC ---
            const signalingTypes = [
                'initiate-call',
                'call-accepted',
                'call-offer',
                'call-answer',
                'ice-candidate',
                'end-call'
            ];

            if (signalingTypes.includes(type)) {
                // This function will forward the message to the other party in the ride
                forwardSignalingMessage(ws, type, payload);
                return;
            }

            if (ws.driverInfo) {
                switch (type) {
                    case 'status_change': return handleStatusChange(ws, parsedMessage);
                    case 'location_update': return handleLocationUpdate(ws, parsedMessage);
                    case 'ACCEPT_RIDE':
                        handleAcceptRide(ws, parsedMessage).then(ride => {
                            if (ride) {
                                startBroadcastingDriverLocation(ride.id, ride.driver_id, ride.customer_id);
                            }
                        });
                        return;
                    case 'MARK_ARRIVED': return handleMarkArrived(ws, parsedMessage);
                    case 'START_RIDE': return handleStartRide(ws, parsedMessage);
                    case 'END_RIDE':
                        handleEndRide(ws, parsedMessage).then(() => {
                            stopBroadcastingDriverLocation(parsedMessage.payload.rideId);
                        });
                        return;
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

            setTimeout(async () => {
                if (connectionManager.activeDriverSockets.has(driverId)) {
                    console.log(`Driver ${driverId} reconnected within grace period.`);
                    return;
                }
                
                try {
                    const { rows } = await db.query(`SELECT online_status FROM drivers WHERE id = $1`, [driverId]);
                    const lastStatus = rows[0]?.online_status;

                    if (lastStatus === 'online' || lastStatus === 'go_home') {
                        console.log(`Driver ${driverId} did not reconnect. Setting status to offline.`);
                        await handleStatusChange(ws, { payload: { status: 'offline' } });
                    }
                } catch (error) {
                    console.error(`Error during disconnected driver cleanup for ${driverId}:`, error);
                }
            }, 30000);
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

function startBroadcastingDriverLocation(rideId, driverId, customerId) {
    stopBroadcastingDriverLocation(rideId);

    const intervalId = setInterval(async () => {
        try {
            const customerSocket = connectionManager.activeCustomerSockets.get(customerId);
            if (!customerSocket || customerSocket.readyState !== WebSocket.OPEN) {
                stopBroadcastingDriverLocation(rideId);
                return;
            }

            const driverState = await redisClient.hGetAll(`driver:state:${driverId}`);
            if (driverState && driverState.latitude && driverState.longitude) {
                customerSocket.send(JSON.stringify({
                    type: 'DRIVER_LOCATION_UPDATE',
                    payload: {
                        rideId,
                        latitude: parseFloat(driverState.latitude),
                        longitude: parseFloat(driverState.longitude),
                        bearing: driverState.bearing ? parseFloat(driverState.bearing) : null
                    }
                }));
            }
        } catch (error) {
            console.error(`Error broadcasting location for ride ${rideId}:`, error);
        }
    }, 6000);

    rideLocationBroadcasters.set(rideId, intervalId);
    console.log(`[LocationBroadcast] Started for ride ${rideId}`);
}

function stopBroadcastingDriverLocation(rideId) {
    if (rideLocationBroadcasters.has(rideId)) {
        clearInterval(rideLocationBroadcasters.get(rideId));
        rideLocationBroadcasters.delete(rideId);
        console.log(`[LocationBroadcast] Stopped for ride ${rideId}`);
    }
}

app.get('/', (req, res) => res.status(200).send('Ride-Service is running.'));

const startServer = async () => {
  await connectRedis();
  await db.connectDb();
  server.listen(PORT, () => console.log(`Ride-Service is listening on port ${PORT}`));
};

startServer();