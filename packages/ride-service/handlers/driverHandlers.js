// packages/ride-service/handlers/driverHandlers.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');
const { connectionManager } = require('../services/rideManager');
const { getHaversineDistance } = require('../utils/geo');

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
      
      const lastLocation = await redisClient.hGetAll(stateKey);
      if (lastLocation && lastLocation.latitude && lastLocation.longitude) {
          await redisClient.geoAdd(geoKey, {
              longitude: parseFloat(lastLocation.longitude),
              latitude: parseFloat(lastLocation.latitude),
              member: driverId.toString(),
          });
      }

    } else { // 'offline'
      await redisClient.zRem(geoKey, driverId.toString());
      await redisClient.del(stateKey);
    }

    await client.query('COMMIT');
    ws.send(JSON.stringify({ type: 'status_updated', status }));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error updating status for driver ${driverId}:`, error);
  } finally {
    client.release();
  }
};

const handleLocationUpdate = async (ws, message) => {
  const { latitude, longitude } = message.payload;
  const { driverId, city } = ws.driverInfo;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

  try {
    const stateKey = `driver:state:${driverId}`;
    const geoKey = `online_drivers:${city}`;
    
    await redisClient.hSet(stateKey, 'latitude', latitude.toString());
    await redisClient.hSet(stateKey, 'longitude', longitude.toString());
    
    const driverStatus = await redisClient.hGet(stateKey, 'status');

    if (driverStatus === 'online' || driverStatus === 'go_home' || driverStatus === 'en_route_to_pickup') {
        await redisClient.geoAdd(geoKey, {
            longitude,
            latitude,
            member: driverId.toString(),
        });
    }

  } catch (error) {
    console.error(`Error updating location for driver ${driverId}:`, error);
  }
};

const handleAcceptRide = async (ws, message) => {
    const { rideId } = message.payload;
    const { driverId } = ws.driverInfo;

    try {
        const result = await redisClient.set(`ride_request:${rideId}`, `accepted_by:${driverId}`, { XX: true, GET: true });
        
        if (result === null || result.startsWith('accepted_by:')) {
            return ws.send(JSON.stringify({ type: 'RIDE_ALREADY_TAKEN', payload: { rideId } }));
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const rideUpdateResult = await client.query(
                `UPDATE rides SET driver_id = $1, status = 'en_route_to_pickup' WHERE id = $2 AND status = 'requested' RETURNING *`,
                [driverId, rideId]
            );
            
            if (rideUpdateResult.rowCount === 0) throw new Error('Ride was already accepted.');
            
            const ride = rideUpdateResult.rows[0];

            await client.query(`UPDATE drivers SET online_status = 'en_route_to_pickup' WHERE id = $1`, [driverId]);

            const driverDetailsQuery = `
                SELECT u.full_name, u.profile_image_url, d.rating, dv.model_name, dv.registration_number
                FROM drivers d
                JOIN users u ON d.user_id = u.id
                JOIN driver_vehicles dv ON d.id = dv.driver_id
                WHERE d.id = $1
            `;
            const { rows: driverDetailsRows } = await client.query(driverDetailsQuery, [driverId]);
            const driverDetails = driverDetailsRows[0];
            
            await client.query('COMMIT');

            ws.send(JSON.stringify({ type: 'RIDE_CONFIRMED', payload: ride }));

            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket) {
                const customerPayload = {
                    rideId,
                    otp: ride.otp,
                    driver: {
                        name: driverDetails.full_name,
                        rating: parseFloat(driverDetails.rating),
                        photo_url: driverDetails.profile_image_url
                    },
                    vehicle: {
                        model: driverDetails.model_name,
                        license_plate: driverDetails.registration_number
                    }
                };
                customerSocket.send(JSON.stringify({ type: 'DRIVER_ASSIGNED', payload: customerPayload }));
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
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Could not accept ride.' } }));
    }
};

const handleMarkArrived = async (ws, message) => {
    const { rideId } = message.payload;
    const { driverId } = ws.driverInfo;

    try {
        const { rows: rideRows } = await db.query(`SELECT id, customer_id, pickup_latitude, pickup_longitude FROM rides WHERE id = $1 AND driver_id = $2 AND status = 'en_route_to_pickup'`, [rideId, driverId]);
        if (rideRows.length === 0) return ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid ride or not in correct state.' } }));
        const ride = rideRows[0];

        const driverLocationArray = await redisClient.geoPos(`online_drivers:${ws.driverInfo.city}`, driverId);
        const driverCoords = { latitude: driverLocationArray[0].latitude, longitude: driverLocationArray[0].longitude };
        const pickupCoords = { latitude: ride.pickup_latitude, longitude: ride.pickup_longitude };
        
        const distance = getHaversineDistance(driverCoords, pickupCoords);
        if (distance > 0.1) {
            return ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'You are not close enough to the pickup location.' } }));
        }

        await db.query(`UPDATE rides SET status = 'arrived' WHERE id = $1`, [rideId]);
        await db.query(`UPDATE drivers SET online_status = 'arrived' WHERE id = $1`, [driverId]);

        ws.send(JSON.stringify({ type: 'ARRIVAL_CONFIRMED', payload: { rideId } }));

        const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
        if (customerSocket) {
            customerSocket.send(JSON.stringify({ type: 'DRIVER_ARRIVED', payload: { rideId } }));
        }
    } catch (error) {
        console.error(`Error handling mark arrived for ride ${rideId}:`, error);
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Could not mark as arrived.' } }));
    }
};

const handleStartRide = async (ws, message) => {
    const { rideId, otp } = message.payload;
    const { driverId } = ws.driverInfo;

    try {
        const { rows } = await db.query(`SELECT id, customer_id, otp FROM rides WHERE id = $1 AND driver_id = $2 AND status = 'arrived'`, [rideId, driverId]);
        if (rows.length === 0 || rows[0].otp !== otp) {
            return ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid OTP or ride state.' } }));
        }
        const ride = rows[0];

        await db.query(`UPDATE rides SET status = 'in_progress' WHERE id = $1`, [rideId]);
        await db.query(`UPDATE drivers SET online_status = 'in_ride' WHERE id = $1`, [driverId]);

        ws.send(JSON.stringify({ type: 'RIDE_STARTED_CONFIRMED', payload: { rideId } }));

        const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
        if (customerSocket) {
            customerSocket.send(JSON.stringify({ type: 'RIDE_STARTED', payload: { rideId } }));
        }
    } catch (error) {
        console.error(`Error starting ride ${rideId}:`, error);
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Could not start ride.' } }));
    }
};

const handleEndRide = async (ws, message) => {
    const { rideId, end_ride_otp } = message.payload;
    const { driverId } = ws.driverInfo;

    try {
        const { rows } = await db.query(`SELECT * FROM rides WHERE id = $1 AND driver_id = $2 AND status = 'in_progress'`, [rideId, driverId]);
        if (rows.length === 0) return ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Ride cannot be ended now.' } }));
        const ride = rows[0];

        const driverLocationArray = await redisClient.geoPos(`online_drivers:${ws.driverInfo.city}`, driverId);
        const driverCoords = { latitude: driverLocationArray[0].latitude, longitude: driverLocationArray[0].longitude };
        const dropoffCoords = { latitude: ride.destination_latitude, longitude: ride.destination_longitude };

        const distance = getHaversineDistance(driverCoords, dropoffCoords);

        // Normal Completion
        if (distance <= 0.1) { // 100 meters threshold
            await db.query(`UPDATE rides SET status = 'completed' WHERE id = $1`, [rideId]);
            await db.query(`UPDATE drivers SET online_status = 'online' WHERE id = $1`, [driverId]);

            ws.send(JSON.stringify({ type: 'RIDE_COMPLETED_CONFIRMED', payload: { rideId, payment_method: ride.payment_method } }));

            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket) {
                customerSocket.send(JSON.stringify({ type: 'RIDE_COMPLETED', payload: { rideId } }));
            }
            return;
        }

        // Early Completion Logic
        if (end_ride_otp) {
            if (ride.end_ride_otp === end_ride_otp) {
                // OTP matches, complete the ride
                await db.query(`UPDATE rides SET status = 'completed' WHERE id = $1`, [rideId]);
                await db.query(`UPDATE drivers SET online_status = 'online' WHERE id = $1`, [driverId]);

                ws.send(JSON.stringify({ type: 'RIDE_COMPLETED_CONFIRMED', payload: { rideId, payment_method: ride.payment_method } }));

                const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
                if (customerSocket) {
                    customerSocket.send(JSON.stringify({ type: 'RIDE_COMPLETED', payload: { rideId } }));
                }
            } else {
                ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid End Ride OTP.' } }));
            }
        } else {
            // First attempt to end early: generate and send OTP
            const newEndOtp = Math.floor(1000 + Math.random() * 9000).toString();
            await db.query(`UPDATE rides SET end_ride_otp = $1 WHERE id = $2`, [newEndOtp, rideId]);

            ws.send(JSON.stringify({ type: 'REQUIRE_END_RIDE_OTP', payload: { rideId, message: 'You are far from the destination. Please ask the customer for the end ride OTP.' } }));

            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket) {
                customerSocket.send(JSON.stringify({ type: 'END_RIDE_OTP_GENERATED', payload: { rideId, otp: newEndOtp } }));
            }
        }

    } catch (error) {
        console.error(`Error ending ride ${rideId}:`, error);
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Could not end ride.' } }));
    }
};

module.exports = {
  handleStatusChange,
  handleLocationUpdate,
  handleAcceptRide,
  handleMarkArrived,
  handleStartRide,
  handleEndRide,
};