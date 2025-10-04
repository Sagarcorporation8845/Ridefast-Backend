// packages/pricing-service/db.js
const { createDatabaseService } = require('../../shared/dbService');
const { monitor } = require('../../shared/dbMonitor');

// Create database service instance for pricing-service
const dbService = createDatabaseService('pricing-service');

// Register with monitor
monitor.registerService('pricing-service', dbService);

// Connect function
const connectDb = async () => {
  try {
    const connected = await dbService.connect();
    if (!connected) {
      console.error('❌ FATAL: [pricing-service] Failed to connect to the database.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FATAL: [pricing-service] Failed to connect to the database.');
    console.error(err.message || err.stack);
    process.exit(1);
  }
};

// Query function
const query = (text, params) => dbService.query(text, params);

module.exports = {
  query,
  connectDb,
};