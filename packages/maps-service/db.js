// packages/maps-service/db.js
const { createDatabaseService } = require('../../shared/dbService');
const { monitor } = require('../../shared/dbMonitor');

const dbService = createDatabaseService('maps-service');
monitor.registerService('maps-service', dbService);

const connectDb = async () => {
  try {
    const connected = await dbService.connect();
    if (!connected) {
      console.error('❌ FATAL: [maps-service] Failed to connect to the database.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FATAL: [maps-service] Failed to connect to the database.');
    console.error(err.message || err.stack);
    process.exit(1);
  }
};

const query = (text, params) => dbService.query(text, params);

module.exports = {
  query,
  connectDb,
};