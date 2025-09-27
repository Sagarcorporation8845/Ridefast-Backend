const { createClient } = require('redis');

// Start with the base configuration object
const redisOptions = {
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
};

// Conditionally add the TLS option if the environment variable is set to 'true'.
// This allows you to enable SSL/TLS only for your production environment.
if (process.env.REDIS_USE_TLS === 'true') {
  redisOptions.socket.tls = true;
  console.log('[ride-service] Redis connection configured to use TLS/SSL.');
}

// Create the client with the final options
const redisClient = createClient(redisOptions);

// Set up an error listener to catch and log any Redis client errors
redisClient.on('error', err => console.error('Redis Client Error', err));

// Create a new async function to handle the connection
const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('✅ [ride-service] Connected to Redis server.');
  } catch (err) {
    console.error('❌ FATAL: [ride-service] Could not connect to Redis server.', err);
    process.exit(1); // Exit the process if the Redis connection fails on startup
  }
};

module.exports = {
  redisClient,
  connectRedis,
};