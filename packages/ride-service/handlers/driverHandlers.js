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
      console.log(`Driver ${driverId} is now ${status}.`);
    } else { // offline
      await redisClient.zRem(geoKey, driverId.toString());
      await redisClient.del(stateKey);
      console.log(`Driver ${driverId} is now offline.`);
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
    return;
  }

  try {
    const geoKey = `online_drivers:${city}`;
    
    await redisClient.geoAdd(geoKey, {
      longitude,
      latitude,
      member: driverId.toString(),
    });

  } catch (error) {
    console.error(`Error updating location for driver ${driverId}:`, error);
  }
};

const handleAcceptRide = async (ws, message) => {
    const { rideId } = message.payload;
    const { driverId } = ws.driverInfo;

    try {
        // Atomically check and update the ride request key in Redis.
        // This command attempts to change the value of the key only if it exists.
        // It returns the new value if successful, or null if the key doesn't exist (expired).
        const result = await redisClient.set(`ride_request:${rideId}`, `accepted_by:${driverId}`, {
            XX: true, // Only set the key if it already exists
            GET: true // Return the old value before setting
        });
        
        // If result is null, the key expired. If it contains 'accepted_by', another driver was faster.
        if (result === null || result.startsWith('accepted_by:')) {
            ws.send(JSON.stringify({ type: 'RIDE_ALREADY_TAKEN', payload: { rideId } }));
            return;
        }

        console.log(`[RideManager] Driver ${driverId} has won ride ${rideId}`);
        
        // This driver is the winner, update database records.
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const rideUpdateResult = await client.query(
                `UPDATE rides SET driver_id = $1, status = 'accepted' WHERE id = $2 AND status = 'requested' RETURNING *`,
                [driverId, rideId]
            );
            
            if (rideUpdateResult.rowCount === 0) {
                // This is a rare race condition where another process might have updated the DB first.
                throw new Error('Ride was already accepted by another driver.');
            }
            
            const ride = rideUpdateResult.rows[0];

            await client.query(`UPDATE drivers SET online_status = 'en_route_to_pickup' WHERE id = $1`, [driverId]);

            await client.query('COMMIT');

            // Notify the winning driver
            ws.send(JSON.stringify({ type: 'RIDE_CONFIRMED', payload: ride }));

            // Notify the customer via their WebSocket
            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket) {
                // You should fetch more driver details here to send to the customer
                customerSocket.send(JSON.stringify({ type: 'DRIVER_ASSIGNED', payload: { rideId, driverId } }));
            }

            // TODO: Notify other broadcasted drivers that the ride has been taken.

        } catch (dbError) {
            await client.query('ROLLBACK');
            // Revert Redis state if DB update failed
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