// packages/ride-service/handlers/driverHandlers.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');

// Handles the driver's change of status (online, offline, go_home)
const handleStatusChange = async (ws, message) => {
  const { status } = message.payload;
  const { driverId, city } = ws.driverInfo;
  const validStatuses = ['online', 'offline', 'go_home'];

  if (!validStatuses.includes(status)) {
    return ws.send(JSON.stringify({ type: 'error', message: 'Invalid status provided.' }));
  }

  // FIX: Use a database client for transactions
  const client = await db.getClient(); 

  try {
    // 1. Begin a transaction
    await client.query('BEGIN');

    // 2. Update the persistent state in PostgreSQL
    await client.query(
      "UPDATE drivers SET online_status = $1 WHERE id = $2",
      [status, driverId]
    );

    const geoKey = `online_drivers:${city}`;
    const stateKey = `driver:state:${driverId}`;

    // 3. Update the real-time state in Redis
    if (status === 'online' || status === 'go_home') {
      await redisClient.hSet(stateKey, 'status', status);
      console.log(`Driver ${driverId} is now ${status}.`);
    } else { // offline
      await redisClient.zRem(geoKey, driverId.toString());
      await redisClient.del(stateKey);
      console.log(`Driver ${driverId} is now offline.`);
    }

    // 4. Commit the transaction
    await client.query('COMMIT');

    ws.send(JSON.stringify({ type: 'status_updated', status }));

  } catch (error) {
    // 5. Rollback the transaction in case of an error
    await client.query('ROLLBACK');
    console.error(`Error updating status for driver ${driverId}:`, error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update status.' }));
  } finally {
    // 6. Release the client back to the pool
    client.release();
  }
};

// Handles incoming location updates from the driver
const handleLocationUpdate = async (ws, message) => {
  const { latitude, longitude } = message.payload;
  const { driverId, city } = ws.driverInfo;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return; // Ignore invalid data
  }

  try {
    const geoKey = `online_drivers:${city}`;
    
    // Update the driver's location in the Redis geospatial index
    await redisClient.geoAdd(geoKey, {
      longitude,
      latitude,
      member: driverId.toString(),
    });

  } catch (error) {
    console.error(`Error updating location for driver ${driverId}:`, error);
  }
};

module.exports = {
  handleStatusChange,
  handleLocationUpdate,
};