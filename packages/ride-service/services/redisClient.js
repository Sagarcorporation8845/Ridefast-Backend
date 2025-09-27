const { createClient } = require('redis');

const redisClient = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

redisClient.on('error', err => console.error('Redis Client Error', err));

// Create a new function to handle the connection
const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('✅ [ride-service] Connected to Redis server.');
  } catch (err) {
    console.error('❌ FATAL: [ride-service] Could not connect to Redis server.', err);
    process.exit(1); // Exit the process if Redis connection fails
  }
};

module.exports = {
  redisClient,
  connectRedis,
};