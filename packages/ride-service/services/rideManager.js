// packages/ride-service/services/rideManager.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');

// This object will be a simplified in-memory map of active connections.
const connectionManager = {
    activeDriverSockets: new Map(),
    activeCustomerSockets: new Map(),
};

/**
 * Finds eligible drivers in an expanding radius, filtered by vehicle category.
 */
const findEligibleDrivers = async (pickupCoordinates, city, vehicleCategory, subCategory, attempt = 1) => {
    const radius = attempt === 1 ? 3 : 7; // 3km for 1st attempt, 7km for 2nd
    const geoKey = `online_drivers:${city}`;
    console.log(`[RideManager-Debug] Attempt #${attempt}: Searching for '${vehicleCategory}' drivers in city '${city}' within ${radius}km.`);

    try {
        const driverIds = await redisClient.geoSearch(geoKey, pickupCoordinates, { radius, unit: 'km' });

        if (driverIds.length === 0) {
            console.log(`[RideManager-Debug] GEOSEARCH found 0 drivers in the area.`);
            return [];
        }
        console.log(`[RideManager-Debug] GEOSEARCH found ${driverIds.length} potential drivers:`, driverIds);

        // Build a dynamic query to filter by vehicle category and sub-category
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
        
        if (rows.length === 0) {
            console.log(`[RideManager-Debug] No drivers found after filtering for vehicle category '${vehicleCategory}'.`);
            return [];
        }

        const eligibleDriverIds = rows.map(row => row.id);
        console.log(`[RideManager-Debug] Found ${eligibleDriverIds.length} drivers with the correct vehicle type.`);
        
        // Final check to ensure drivers have an active WebSocket connection
        const connectedAndEligible = eligibleDriverIds.filter(id => connectionManager.activeDriverSockets.has(id));
        console.log(`[RideManager-Debug] Found ${connectedAndEligible.length} connected and eligible drivers.`);
        
        return connectedAndEligible;
    } catch (error) {
        console.error('[RideManager-Debug] Error in findEligibleDrivers:', error);
        return [];
    }
};

/**
 * Broadcasts a ride request to a list of drivers.
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
 */
const manageRideRequest = async (rideId, decodedFare) => {
    console.log(`[RideManager-Debug] Managing new ride request: ${rideId}`);
    
    // 1. Fetch the full ride details from the database
    const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    if (rows.length === 0) {
        console.error(`[RideManager-Debug] CRITICAL: Ride ${rideId} not found in database.`);
        return;
    }
    const ride = rows[0];

    // 2. Securely get vehicle details from the verified fare token
    const vehicleCategory = decodedFare.vehicle;
    const subCategory = decodedFare.sub_category;
    console.log(`[RideManager-Debug] Ride requires vehicle: ${vehicleCategory} ${subCategory || ''}`);

    // 3. Get driver's city to know where to search
    const driverResult = await db.query('SELECT city FROM drivers WHERE user_id = $1', [ride.customer_id]);
    if (driverResult.rows.length === 0) {
        console.error(`[RideManager-Debug] CRITICAL: Could not determine city for ride ${rideId}. Customer may not have a driver profile.`);
        // As a fallback, you might try to geocode the pickup location to find the city.
        // For now, we will stop if the city is unknown.
        return;
    }
    const city = driverResult.rows[0].city;
    console.log(`[RideManager-Debug] Ride is in city: ${city}`);

    const pickupCoordinates = {
        latitude: parseFloat(ride.pickup_latitude),
        longitude: parseFloat(ride.pickup_longitude)
    };

    // --- First Attempt ---
    const nearbyDrivers1 = await findEligibleDrivers(pickupCoordinates, city, vehicleCategory, subCategory, 1);
    if (nearbyDrivers1.length > 0) {
        await redisClient.set(`ride_request:${rideId}`, "attempt_1", { EX: 20 });
        broadcastToDrivers(rideId, ride, nearbyDrivers1);
    } else {
        console.log(`[RideManager] No drivers found in the first attempt for ride ${rideId}.`);
    }

    // --- Schedule Second Attempt ---
    setTimeout(async () => {
        const currentRide = await db.query('SELECT status FROM rides WHERE id = $1', [rideId]);
        if (currentRide.rows[0]?.status !== 'requested') {
            console.log(`[RideManager-Debug] Ride ${rideId} is no longer in 'requested' state. Halting second attempt.`);
            return;
        }
        
        console.log(`[RideManager] Ride ${rideId} not accepted after 20s. Starting second attempt.`);
        const nearbyDrivers2 = await findEligibleDrivers(pickupCoordinates, city, vehicleCategory, subCategory, 2);
        if (nearbyDrivers2.length > 0) {
            await redisClient.set(`ride_request:${rideId}`, "attempt_2", { EX: 20 });
            broadcastToDrivers(rideId, ride, nearbyDrivers2);
        } else {
             console.log(`[RideManager] No drivers found in the second attempt for ride ${rideId}.`);
        }

        // --- Schedule Final Failure Check ---
        setTimeout(async () => {
            const finalRideCheck = await db.query('SELECT status FROM rides WHERE id = $1', [rideId]);
            if (finalRideCheck.rows[0]?.status !== 'requested') {
                 console.log(`[RideManager-Debug] Ride ${rideId} was handled. Final check complete.`);
                return;
            }

            console.log(`[RideManager] Ride ${rideId} not accepted after 40s. Cancelling request.`);
            await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = $1`, [rideId]);

            const customerSocket = connectionManager.activeCustomerSockets.get(ride.customer_id);
            if (customerSocket && customerSocket.readyState === customerSocket.OPEN) {
                customerSocket.send(JSON.stringify({
                    type: 'NO_DRIVERS_AVAILABLE',
                    payload: { rideId }
                }));
                 console.log(`[RideManager] Notified customer ${ride.customer_id} that no drivers were available.`);
            }
        }, 20000); // 20 seconds for the second attempt
    }, 21000); // 21 seconds to check after the first attempt
};

module.exports = {
    manageRideRequest,
    connectionManager,
};