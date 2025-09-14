// packages/admin-service/db.js
const { createDatabaseService } = require('../../shared/dbService');
const { monitor } = require('../../shared/dbMonitor');

// Create database service instance for admin-service
const dbService = createDatabaseService('admin-service');

// Register with monitor
monitor.registerService('admin-service', dbService);

// Connect function for backward compatibility
const connectDb = async () => {
  try {
    const connected = await dbService.connect();
    if (!connected) {
      console.error('❌ FATAL: [admin-service] Failed to connect to the database.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FATAL: [admin-service] Failed to connect to the database.');
    console.error(err.message || err.stack);
    process.exit(1);
  }
};

// Query function for backward compatibility
const query = async (text, params) => {
  return await dbService.query(text, params);
};

// Export stats function for monitoring
const getDbStats = () => dbService.getStats();

module.exports = {
  query,
  connectDb,
  getDbStats,
  dbService
};