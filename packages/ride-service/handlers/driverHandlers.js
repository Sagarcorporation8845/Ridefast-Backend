const db = require('../db');
// FIX: Destructure redisClient correctly from the imported module
const { redisClient } = require('../services/redisClient');

// Handles the driver's change of status (online, offline, go_home)
const handleStatusChange = async (ws, message) => {
  const { status } = message.payload;
  const { driverId, city } = ws.driverInfo;
  const validStatuses = ['online', 'offline', 'go_home'];

  if (!validStatuses.includes(status)) {
    return ws.send(JSON.stringify({ type: 'error', message: 'Invalid status provided.' }));
  }

  try {
    // 1. Update the persistent state in PostgreSQL
    await db.query(
      "UPDATE drivers SET online_status = $1 WHERE id = $2",
      [status, driverId]
    );

    const geoKey = `online_drivers:${city}`;
    const stateKey = `driver:state:${driverId}`;

    // 2. Update the real-time state in Redis
    if (status === 'online' || status === 'go_home') {
      await redisClient.hSet(stateKey, 'status', status);
      console.log(`Driver ${driverId} is now ${status}.`);
    } else { // offline
      await redisClient.zRem(geoKey, driverId.toString());
      await redisClient.del(stateKey);
      console.log(`Driver ${driverId} is now offline.`);
    }

    ws.send(JSON.stringify({ type: 'status_updated', status }));

  } catch (error) {
    console.error(`Error updating status for driver ${driverId}:`, error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update status.' }));
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