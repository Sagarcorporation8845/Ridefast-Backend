// packages/ride-service/handlers/driverHandlers.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');
const { connectionManager } = require('../services/rideManager');

const handleStatusChange = async (ws, message) => {
  const { status } = message.payload;
  const { driverId, city } = ws.driverInfo;
  const validStatuses = ['online', 'offline', 'go_home'];

  if (!validStatuses.includes(status)) {
    return ws.send(JSON.stringify({ type: 'error', message: 'Invalid status provided.' }));
  }

  const client = await db.getClient(); 

  try {
    await client.query('BEGIN');
    await client.query(
      "UPDATE drivers SET online_status = $1 WHERE id = $2",
      [status, driverId]
    );

    const geoKey = `online_drivers:${city}`;
    const stateKey = `driver:state:${driverId}`;

    if (status === 'online' || status === 'go_home') {
      await redisClient.hSet(stateKey, 'status', status);
      console.log(`Driver ${driverId} is now ${status}. Waiting for first location update to be visible.`);
    } else { // offline
      // This part is correct: it removes the driver from Redis when they go offline.
      await redisClient.zRem(geoKey, driverId.toString());
      await redisClient.del(stateKey);
      console.log(`Driver ${driverId} is now offline and removed from map.`);
    }

    await client.query('COMMIT');
    ws.send(JSON.stringify({ type: 'status_updated', status }));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error updating status for driver ${driverId}:`, error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to update status.' }));
  } finally {
    client.release();
  }
};

const handleLocationUpdate = async (ws, message) => {
  const { latitude, longitude } = message.payload;
  const { driverId, city } = ws.driverInfo;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return; // Ignore invalid data
  }

  try {
    const stateKey = `driver:state:${driverId}`;
    const driverStatus = await redisClient.hGet(stateKey, 'status');

    // --- FIX IS HERE ---
    // Only add/update the driver's location in the geospatial index if their status is 'online' or 'go_home'.
    if (driverStatus === 'online' || driverStatus === 'go_home') {
        const geoKey = `online_drivers:${city}`;
        
        // The GEOADD command will automatically add the driver if they are new
        // or update their location if they already exist. This is the correct logic.
        await redisClient.geoAdd(geoKey, {
          longitude,
          latitude,
          member: driverId.toString(),
        });
        console.log(`[Location Update] Updated location for online driver ${driverId} in ${city}.`);
    }

  } catch (error) {
    console.error(`Error updating location for driver ${driverId}:`, error);
  }
};

const handleAcceptRide = async (ws, message) => {
    const { rideId } = message.payload;
    const { driverId } = ws.driverInfo;

    try {
        const result = await redisClient.set(`ride_request:${rideId}`, `accepted_by:${driverId}`, {
            XX: true,
            GET: true
        });
        
        if (result === null || result.startsWith('accepted_by:')) {
            ws.send(JSON.stringify({ type: 'RIDE_ALREADY_TAKEN', payload: { rideId } }));
            return;
        }

        console.log(`[RideManager] Driver ${driverId} has won ride ${rideId}`);
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const rideUpdateResult = await client.query(
                `UPDATE rides SET driver_id = $1, status = 'accepted' WHERE id = $2 AND status = 'requested' RETURNING *`,
                [driverId, rideId]
            );
            
            if (rideUpdateResult.rowCount === 0) {
                throw new Error('Ride was already accepted by another driver.');
            }
            
            const ride = rideUpdateResult.rows[0];

            await client.query(`UPDATE drivers SET online_status = 'en_route_to_pickup' WHERE id = $1`, [driverId]);

            await client.query('COMMIT');

            ws.send(JSON.stringify({ type: 'RIDE_CONFIRMED', payload: ride }));

            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket) {
                customerSocket.send(JSON.stringify({ type: 'DRIVER_ASSIGNED', payload: { rideId, driverId } }));
            }

        } catch (dbError) {
            await client.query('ROLLBACK');
            await redisClient.set(`ride_request:${rideId}`, result, { KEEPTTL: true });
            throw dbError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error(`Error handling ride acceptance for driver ${driverId} and ride ${rideId}:`, error);
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Could not accept ride due to a server error.' } }));
    }
};

module.exports = {
  handleStatusChange,
  handleLocationUpdate,
  handleAcceptRide,
};