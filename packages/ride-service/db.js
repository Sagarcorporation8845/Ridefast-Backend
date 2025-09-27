// packages/ride-service/db.js
const { createDatabaseService } = require('../../shared/dbService');
const { monitor } = require('../../shared/dbMonitor');

// Create a database service instance for this specific service
const dbService = createDatabaseService('ride-service');

// Register it with the central monitor
monitor.registerService('ride-service', dbService);

// Function to connect, which will try the central pool first, then local
const connectDb = async () => {
  try {
    const connected = await dbService.connect();
    if (!connected) {
      console.error('❌ FATAL: [ride-service] Failed to connect to the database.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FATAL: [ride-service] Failed to connect to the database.');
    console.error(err.message || err.stack);
    process.exit(1);
  }
};

// The query function now uses the smart service that handles fallbacks
const query = (text, params) => dbService.query(text, params);

// FIX: Expose a getClient function to allow for transactions
const getClient = () => {
  if (dbService.centralDb && dbService.centralDb.centralPool) {
    return dbService.centralDb.centralPool.connect();
  }
  if (dbService.localPool) {
    return dbService.localPool.connect();
  }
  throw new Error('No database pool available to get a client from.');
};

module.exports = {
  query,
  connectDb,
  getClient, // Export the new function
};