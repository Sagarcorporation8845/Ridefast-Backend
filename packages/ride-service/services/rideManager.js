// packages/ride-service/services/rideManager.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');

// This object will be a simplified in-memory map of active connections.
// In a production scenario with multiple server instances, this would be managed
// through Redis Pub/Sub or another shared messaging system.
const connectionManager = {
    activeDriverSockets: new Map(),
    activeCustomerSockets: new Map(),
};

/**
 * Finds eligible drivers in an expanding radius.
 * @param {object} pickupCoordinates - The lat/lng of the pickup.
 * @param {string} city - The city of the ride.
 * @param {string} vehicleCategory - The category of vehicle required.
 * @param {number} attempt - The attempt number (1 for small radius, 2 for larger).
 * @returns {Promise<string[]>} - A promise that resolves to an array of driver IDs.
 */
const findEligibleDrivers = async (pickupCoordinates, city, vehicleCategory, attempt = 1) => {
    const radius = attempt === 1 ? 3 : 7; // 3km for 1st attempt, 7km for 2nd
    const geoKey = `online_drivers:${city}`;

    try {
        const driverIds = await redisClient.geoSearch(geoKey, pickupCoordinates, { radius, unit: 'km' });

        if (driverIds.length === 0) return [];

        // Filter drivers by vehicle category and ensure they are connected via WebSocket
        const { rows } = await db.query(
            `SELECT d.id FROM drivers d
             JOIN driver_vehicles dv ON d.id = dv.driver_id
             WHERE d.id = ANY($1::uuid[]) AND dv.category = $2`,
            [driverIds, vehicleCategory]
        );

        const eligibleDriverIds = rows.map(row => row.id);
        
        // Return only drivers who have an active WebSocket connection
        return eligibleDriverIds.filter(id => connectionManager.activeDriverSockets.has(id));
    } catch (error) {
        console.error('Error finding eligible drivers:', error);
        return [];
    }
};

/**
 * Broadcasts a ride request to a list of drivers.
 * @param {string} rideId - The ID of the ride.
 * @param {object} rideDetails - Details of the ride to be sent to drivers.
 * @param {string[]} driverIds - An array of driver IDs to broadcast to.
 */
const broadcastToDrivers = (rideId, rideDetails, driverIds) => {
    const message = {
        type: 'NEW_RIDE_REQUEST',
        payload: {
            rideId,
            pickupAddress: rideDetails.pickup_address,
            destinationAddress: rideDetails.destination_address,
            fare: rideDetails.fare,
        }
    };

    driverIds.forEach(driverId => {
        const ws = connectionManager.activeDriverSockets.get(driverId);
        if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
    console.log(`[RideManager] Broadcasted ride ${rideId} to ${driverIds.length} drivers.`);
};

/**
 * Manages the two-attempt broadcast flow for a new ride request.
 * @param {string} rideId - The ID of the ride to manage.
 */
const manageRideRequest = async (rideId) => {
    const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    if (rows.length === 0) return;
    const ride = rows[0];

    const { rows: vehicleRows } = await db.query(
        `SELECT dv.category FROM driver_vehicles dv JOIN drivers d ON dv.driver_id = d.id WHERE d.user_id = $1`,
        [ride.customer_id]
    );
    const vehicleCategory = vehicleRows.length > 0 ? vehicleRows[0].category : null; // This logic needs to be adapted based on how vehicle type is selected. For now, we'll assume a placeholder.
    
    // --- First Attempt ---
    const nearbyDrivers1 = await findEligibleDrivers({ latitude: ride.pickup_latitude, longitude: ride.pickup_longitude }, 'pune', 'bike', 1);
    if (nearbyDrivers1.length > 0) {
        await redisClient.set(`ride_request:${rideId}`, "attempt_1", { EX: 20 });
        broadcastToDrivers(rideId, ride, nearbyDrivers1);
    }

    // --- Schedule Second Attempt ---
    setTimeout(async () => {
        const currentRide = await db.query('SELECT status FROM rides WHERE id = $1', [rideId]);
        if (currentRide.rows[0]?.status !== 'requested') {
            return; // Ride was accepted or cancelled, do nothing.
        }
        
        console.log(`[RideManager] Ride ${rideId} not accepted after 20s. Starting second attempt.`);
        const nearbyDrivers2 = await findEligibleDrivers({ latitude: ride.pickup_latitude, longitude: ride.pickup_longitude }, 'pune', 'bike', 2);
        if (nearbyDrivers2.length > 0) {
            await redisClient.set(`ride_request:${rideId}`, "attempt_2", { EX: 20 });
            broadcastToDrivers(rideId, ride, nearbyDrivers2);
        }

        // --- Schedule Final Failure Check ---
        setTimeout(async () => {
            const finalRideCheck = await db.query('SELECT status FROM rides WHERE id = $1', [rideId]);
            if (finalRideCheck.rows[0]?.status !== 'requested') {
                return;
            }

            console.log(`[RideManager] Ride ${rideId} not accepted after 40s. Cancelling request.`);
            await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = $1`, [rideId]);

            // Notify customer
            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket && customerSocket.readyState === customerSocket.OPEN) {
                customerSocket.send(JSON.stringify({
                    type: 'NO_DRIVERS_AVAILABLE',
                    payload: { rideId }
                }));
            }
        }, 20000); // 20 seconds for the second attempt
    }, 21000); // 21 seconds to check after the first attempt
};

module.exports = {
    manageRideRequest,
    connectionManager,
};