// packages/ride-service/services/rideManager.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');

const connectionManager = {
    activeDriverSockets: new Map(),
    activeCustomerSockets: new Map(),
};

/**
 * Finds eligible drivers in an expanding radius, filtered by vehicle category.
 */
const findEligibleDrivers = async (pickupCoordinates, city, vehicleCategory, subCategory, attempt = 1) => {
    const radius = attempt === 1 ? 3 : 7;
    const geoKey = `online_drivers:${city}`;

    try {
        const driverIds = await redisClient.geoSearch(geoKey, pickupCoordinates, { radius, unit: 'km' });
        if (driverIds.length === 0) return [];

        let filterQuery = `
            SELECT d.id FROM drivers d
            JOIN driver_vehicles dv ON d.id = dv.driver_id
            WHERE d.id = ANY($1::uuid[]) AND dv.category = $2
        `;
        const queryParams = [driverIds, vehicleCategory];
        
        if (subCategory) {
            filterQuery += ` AND dv.sub_category = $3`;
            queryParams.push(subCategory);
        }

        const { rows } = await db.query(filterQuery, queryParams);
        const eligibleDriverIds = rows.map(row => row.id);
        
        return eligibleDriverIds.filter(id => connectionManager.activeDriverSockets.has(id));
    } catch (error) {
        console.error('Error finding eligible drivers:', error);
        return [];
    }
};

/**
 * Calculates the distance between two geo-coordinates using the Haversine formula.
 */
const getHaversineDistance = (coords1, coords2) => {
    const toRad = (x) => x * Math.PI / 180;
    const R = 6371; // Earth's radius in km

    const dLat = toRad(coords2.latitude - coords1.latitude);
    const dLon = toRad(coords2.longitude - coords1.longitude);
    const lat1 = toRad(coords1.latitude);
    const lat2 = toRad(coords2.latitude);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
                        }
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
};