// packages/ride-service/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { authenticateSocket } = require('./middleware/auth');
const { handleStatusChange, handleLocationUpdate } = require('./handlers/driverHandlers');
const { connectDb } = require('./db');
const { connectRedis } = require('./services/redisClient'); // Import connectRedis

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.RIDE_SERVICE_PORT || 3006;

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Ride-Service is running and healthy.');
});

wss.on('connection', async (ws, req) => {
  console.log('Client attempting to connect...');

  const isAuthenticated = await authenticateSocket(ws, req);

  if (isAuthenticated) {
    console.log(`Driver connected: ${ws.driverInfo.driverId}`);

    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        
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
        console.error('Failed to parse incoming message:', message, e);
      }
    });

    ws.on('close', () => {
      console.log(`Driver disconnected: ${ws.driverInfo.driverId}`);
      handleStatusChange(ws, { payload: { status: 'offline' } });
    });

  } else {
    console.log('Client connection rejected: Authentication failed.');
  }
});

const startServer = async () => {
  await connectDb(); // Connect to PostgreSQL
  await connectRedis(); // Connect to Redis
  
  server.listen(PORT, () => {
    console.log(`Ride-Service is listening on port ${PORT}`);
  });
};

startServer();