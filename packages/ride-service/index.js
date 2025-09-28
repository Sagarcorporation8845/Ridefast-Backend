// packages/ride-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { authenticateSocket } = require('./middleware/auth');
const { handleStatusChange, handleLocationUpdate } = require('./handlers/driverHandlers');
const { connectDb } = require('./db');
const { connectRedis } = require('./services/redisClient');
const customerRoutes = require('./routes/customer'); // <-- Import the new customer routes

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.RIDE_SERVICE_PORT || 3006;

// --- Middleware ---
app.use(express.json()); // Add JSON body parser for HTTP requests

// --- API Routes ---
// Mount the new customer routes on the /customer path
app.use('/customer', customerRoutes);

// --- WebSocket Heartbeat Function ---
function heartbeat() {
  this.isAlive = true;
}

// --- WebSocket Connection Handling ---
wss.on('connection', async (ws, req) => {
  console.log('Client attempting to connect...');

  const isAuthenticated = await authenticateSocket(ws, req);

  if (isAuthenticated) {
    console.log(`Driver connected: ${ws.driverInfo.driverId}`);

    // Start heartbeat for this connection
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        
        if (!parsedMessage.type) {
          console.log(`Received message without a 'type':`, parsedMessage);
          return;
        }

        switch (parsedMessage.type) {
          case 'status_change':
            handleStatusChange(ws, parsedMessage);
            break;
          case 'location_update':
            handleLocationUpdate(ws, parsedMessage);
            break;
          default:
            console.log(`Received unknown message type: ${parsedMessage.type}`);
        }
      } catch (e) {
        console.error('Failed to parse incoming message as JSON:', message.toString(), e);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format. Expected JSON.' }));
      }
    });

    ws.on('close', () => {
      console.log(`Driver disconnected: ${ws.driverInfo.driverId}`);
      if (ws.driverInfo) {
        handleStatusChange(ws, { payload: { status: 'offline' } });
      }
    });

  } else {
    console.log('Client connection rejected: Authentication failed.');
  }
});

// Interval to check for dead connections and clean them up
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
}, 20000); // Check every 20 seconds

wss.on('close', function close() {
  clearInterval(interval);
});

// Health check endpoint for the service itself
app.get('/', (req, res) => {
  res.status(200).send('Ride-Service is running and healthy.');
});

// --- Server Startup ---
const startServer = async () => {
  await connectDb();
  await connectRedis();
  
  server.listen(PORT, () => {
    console.log(`Ride-Service is listening on port ${PORT}`);
  });
};

startServer();