// packages/pricing-service/services/fareService.js
const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const googleMapsService = require('./googleMapsService');

const FARE_ID_EXPIRATION = process.env.FARE_ID_EXPIRATION_SECONDS || '300s';

// Creates a SHA256 hash of the route to ensure the fare is tied to the specific journey.
const createRouteHash = (pickup, dropoff) => {
    const routeString = `${pickup.latitude},${pickup.longitude}|${dropoff.latitude},${dropoff.longitude}`;
    return crypto.createHash('sha256').update(routeString).digest('hex');
};

const getFareEstimates = async (pickup, dropoff, userId) => {
    try {
        // 1. Get route details from Google Maps
        const routeDetails = await googleMapsService.getRouteDetails(pickup, dropoff);

        // --- START OF THE FIX ---
        // If routeDetails is null, it means the location is outside our service area.
        // Instead of throwing an error, we return an empty array to signify no fares are available.
        if (!routeDetails) {
            console.log('[pricing-service] No route details returned, likely outside service area. Returning empty estimates.');
            return [];
        }
        // --- END OF THE FIX ---

        const { distanceKm, durationMinutes, city } = routeDetails;

        // 2. Fetch all active vehicle rates for that city
        const ratesResult = await db.query(
            `SELECT vehicle_category, sub_category, base_fare, per_km_rate, per_min_rate 
             FROM vehicle_rates 
             WHERE LOWER(city_name) = LOWER($1) AND is_active = true`,
            [city]
        );

        if (ratesResult.rows.length === 0) {
            console.warn(`[pricing-service] No active vehicle rates found for city: ${city}`);
            return [];
        }

        // 3. TODO: Fetch surge multiplier for the pickup zone from Redis
        const surgeMultiplier = 1.0; // Placeholder for now

        // 4. Calculate fare for each vehicle type
        const estimates = ratesResult.rows.map(rate => {
            const distanceFare = parseFloat(rate.per_km_rate) * distanceKm;
            const timeFare = parseFloat(rate.per_min_rate) * durationMinutes;
            const baseFare = parseFloat(rate.base_fare);
            
            let totalFare = (baseFare + distanceFare + timeFare) * surgeMultiplier;

            // TODO: Add logic for platform fees, tolls, etc.

            // Ensure a minimum fare
            totalFare = Math.max(totalFare, baseFare); 
            
            const roundedFare = Math.round(totalFare * 100) / 100;

            // 5. Create the secure fareId (JWT)
            const routeHash = createRouteHash(pickup, dropoff);
            const payload = {
                userId,
                fare: roundedFare,
                vehicle: rate.vehicle_category,
                sub_category: rate.sub_category,
                routeHash,
            };

            const fareId = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: FARE_ID_EXPIRATION });

            return {
                vehicle_category: rate.vehicle_category,
                sub_category: rate.sub_category,
                display_name: `${rate.vehicle_category} ${rate.sub_category || ''}`.trim(),
                amount: roundedFare,
                fareId,
            };
        });

        // 6. TODO: Apply user-specific promotions

        return estimates;

    } catch (error) {
        console.error('Error in getFareEstimates:', error);
        // Re-throw the error to be caught by the controller for a 500 response
        throw error;
    }
};

module.exports = {
    getFareEstimates,
};