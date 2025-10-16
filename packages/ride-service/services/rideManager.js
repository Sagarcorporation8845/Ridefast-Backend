// packages/ride-service/services/rideManager.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');
const { getHaversineDistance } = require('../utils/geo');

const connectionManager = {
    activeDriverSockets: new Map(),
    activeCustomerSockets: new Map(),
};

/**
 * Forwards a WebRTC signaling message to the correct recipient in an active ride.
 */
const forwardSignalingMessage = async (ws, type, payload) => {
    const { rideId } = payload;
    if (!rideId) {
        console.error('[Signaling] Received signaling message without rideId');
        return;
    }

    try {
        const { rows } = await db.query('SELECT customer_id, driver_id FROM rides WHERE id = $1', [rideId]);
        if (rows.length === 0) {
            console.error(`[Signaling] Ride not found for rideId: ${rideId}`);
            return;
        }

        const ride = rows[0];
        let targetSocket = null;

        // Determine who the recipient is
        if (ws.driverInfo && ws.driverInfo.driverId === ride.driver_id) {
            // Message is from the driver, send to the customer
            targetSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
        } else if (ws.userInfo && ws.userInfo.userId === ride.customer_id) {
            // Message is from the customer, send to the driver
            targetSocket = connectionManager.activeDriverSockets.get(ride.driver_id);
        }

        if (targetSocket && targetSocket.readyState === targetSocket.OPEN) {
            // Forward the message
            targetSocket.send(JSON.stringify({ type, payload }));
            console.log(`[Signaling] Forwarded '${type}' for ride ${rideId}`);
        } else {
            console.warn(`[Signaling] Target user for ride ${rideId} is not connected.`);
        }

    } catch (error) {
        console.error(`[Signaling] Error forwarding message for ride ${rideId}:`, error);
    }
};


/**
 * Finds eligible drivers in an expanding radius, filtered by vehicle category AND availability.
 */
const findEligibleDrivers = async (pickupCoordinates, city, vehicleCategory, subCategory, attempt = 1) => {
    const radius = attempt === 1 ? 3 : 7;
    const geoKey = `online_drivers:${city}`;

    try {
        const driverIds = await redisClient.geoSearch(geoKey, pickupCoordinates, { radius, unit: 'km' });
        if (driverIds.length === 0) return [];

        //    Only select drivers whose status is 'online' or 'go_home'.
        let filterQuery = `
            SELECT d.id FROM drivers d
            JOIN driver_vehicles dv ON d.id = dv.driver_id
            WHERE d.id = ANY($1::uuid[]) 
              AND dv.category = $2
              AND d.online_status IN ('online', 'go_home') 
        `;
        const queryParams = [driverIds, vehicleCategory];
        
        if (subCategory) {
            filterQuery += ` AND dv.sub_category = $3`;
            queryParams.push(subCategory);
        }

        const { rows } = await db.query(filterQuery, queryParams);
        const eligibleDriverIds = rows.map(row => row.id);
        
        // Final filter to ensure they have an active WebSocket connection
        return eligibleDriverIds.filter(id => connectionManager.activeDriverSockets.has(id));
    } catch (error) {
        console.error('Error finding eligible drivers:', error);
        return [];
    }
};


/**
 * Broadcasts a ride request to drivers with a personalized, enriched payload.
 */
const broadcastToDrivers = async (rideId, ride, driverIds, decodedFare) => {
    const pickupCoords = { latitude: parseFloat(ride.pickup_latitude), longitude: parseFloat(ride.pickup_longitude) };
    const dropoffCoords = { latitude: parseFloat(ride.destination_latitude), longitude: parseFloat(ride.destination_longitude) };

    const totalTripDistance = decodedFare.trip_distance_km;

    for (const driverId of driverIds) {
        const ws = connectionManager.activeDriverSockets.get(driverId);
        if (ws && ws.readyState === ws.OPEN) {
            try {
                const driverLocationArray = await redisClient.geoPos(`online_drivers:${ws.driverInfo.city}`, driverId);
                if (!driverLocationArray || !driverLocationArray[0]) continue;

                const driverCoords = { 
                    latitude: parseFloat(driverLocationArray[0].latitude), 
                    longitude: parseFloat(driverLocationArray[0].longitude) 
                };

                const distanceToPickup = getHaversineDistance(driverCoords, pickupCoords).toFixed(1);

                const message = {
                    type: 'NEW_RIDE_REQUEST',
                    payload: {
                        rideId,
                        fare: ride.fare,
                        pickup: {
                            address: ride.pickup_address,
                            latitude: pickupCoords.latitude,
                            longitude: pickupCoords.longitude
                        },
                        dropoff: {
                            address: ride.destination_address,
                            latitude: dropoffCoords.latitude,
                            longitude: dropoffCoords.longitude
                        },
                        distances: {
                            to_pickup_km: `${distanceToPickup} km`,
                            trip_km: `${totalTripDistance} km`
                        },
                        polyline: decodedFare.polyline,
                    }
                };
                
                ws.send(JSON.stringify(message));

            } catch (error) {
                console.error(`Failed to build/send payload to driver ${driverId}:`, error);
            }
        }
    }
    console.log(`[RideManager] Broadcasted ride ${rideId} to ${driverIds.length} drivers.`);
};

/**
 * Manages the two-attempt broadcast flow for a new ride request.
 */
const manageRideRequest = async (rideId, decodedFare) => {
    const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    if (rows.length === 0) {
        console.error(`[RideManager] CRITICAL: Ride ${rideId} not found in database.`);
        return;
    }
    const ride = rows[0];

    const vehicleCategory = decodedFare.vehicle;
    const subCategory = decodedFare.sub_category;
    const city = decodedFare.city;
    
    if (!city) {
        console.error(`[RideManager] CRITICAL: Could not determine city for ride ${rideId}. 'city' is missing from fareId.`);
        return;
    }

    const pickupCoordinates = {
        latitude: parseFloat(ride.pickup_latitude),
        longitude: parseFloat(ride.pickup_longitude)
    };

    const nearbyDrivers1 = await findEligibleDrivers(pickupCoordinates, city, vehicleCategory, subCategory, 1);
    if (nearbyDrivers1.length > 0) {
        await redisClient.set(`ride_request:${rideId}`, "attempt_1", { EX: 20 });
        await broadcastToDrivers(rideId, ride, nearbyDrivers1, decodedFare);
    }

    setTimeout(async () => {
        const currentRide = await db.query('SELECT status FROM rides WHERE id = $1', [rideId]);
        if (currentRide.rows[0]?.status !== 'requested') {
            return;
        }
        
        const nearbyDrivers2 = await findEligibleDrivers(pickupCoordinates, city, vehicleCategory, subCategory, 2);
        if (nearbyDrivers2.length > 0) {
            await redisClient.set(`ride_request:${rideId}`, "attempt_2", { EX: 20 });
            await broadcastToDrivers(rideId, ride, nearbyDrivers2, decodedFare);
        }

        setTimeout(async () => {
            const finalRideCheck = await db.query('SELECT status FROM rides WHERE id = $1', [rideId]);
            if (finalRideCheck.rows[0]?.status !== 'requested') {
                return;
            }

            await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = $1`, [rideId]);

            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket && customerSocket.readyState === customerSocket.OPEN) {
                customerSocket.send(JSON.stringify({
                    type: 'NO_DRIVERS_AVAILABLE',
                    payload: { rideId }
                }));
            }
        }, 20000);
    }, 21000);
};

module.exports = {
    manageRideRequest,
    connectionManager,
    forwardSignalingMessage,
};