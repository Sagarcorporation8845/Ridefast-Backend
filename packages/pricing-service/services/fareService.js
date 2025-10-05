// packages/pricing-service/services/fareService.js
const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const googleMapsService = require('./googleMapsService');

// Creates a SHA256 hash of the route to ensure the fare is tied to the specific journey.
const createRouteHash = (pickup, dropoff) => {
    const routeString = `${pickup.latitude},${pickup.longitude}|${dropoff.latitude},${dropoff.longitude}`;
    return crypto.createHash('sha256').update(routeString).digest('hex');
};

const getFareEstimates = async (pickup, dropoff, userId) => {
    try {
        // 1. Get route details from Google Maps first.
        const routeDetails = await googleMapsService.getRouteDetails(pickup, dropoff);

        // 2. Fetch the user's wallet balance regardless of route validity.
        const walletResult = await db.query(
            `SELECT balance FROM wallets WHERE user_id = $1`,
            [userId]
        );
        const walletBalance = walletResult.rows[0]?.balance || 0;

        // 3. If routeDetails is null, it means the location is outside our service area.
        if (!routeDetails) {
            console.log('[pricing-service] No route details returned, likely outside service area.');
            // Return a response that includes wallet info but no ride options.
            return {
                payment_options: {
                    wallet: {
                        is_available: false, // Wallet is not available if the city can't be determined.
                        balance: parseFloat(walletBalance)
                    }
                },
                options: []
            };
        }

        const { distanceKm, durationMinutes, city } = routeDetails;

        // 4. Fetch city-specific configuration, including the wallet_enabled flag.
        const cityConfigResult = await db.query(
            `SELECT wallet_enabled FROM servicable_cities WHERE LOWER(city_name) = LOWER($1)`,
            [city]
        );
        const isWalletAvailableForCity = cityConfigResult.rows[0]?.wallet_enabled || false;

        // 5. Construct the final payment options object.
        const paymentOptions = {
            wallet: {
                is_available: isWalletAvailableForCity,
                balance: parseFloat(walletBalance)
            }
        };

        // 6. Fetch all active vehicle rates for the determined city.
        const ratesResult = await db.query(
            `SELECT vehicle_category, sub_category, base_fare, per_km_rate, per_min_rate 
             FROM vehicle_rates 
             WHERE LOWER(city_name) = LOWER($1) AND is_active = true`,
            [city]
        );

        if (ratesResult.rows.length === 0) {
            console.warn(`[pricing-service] No active vehicle rates found for city: ${city}`);
            return { options: [], payment_options: paymentOptions };
        }

        // 7. TODO: Fetch surge multiplier for the pickup zone from Redis
        const surgeMultiplier = 1.0; // Placeholder

        // 8. Calculate fare for each available vehicle type.
        const estimates = ratesResult.rows.map(rate => {
            const distanceFare = parseFloat(rate.per_km_rate) * distanceKm;
            const timeFare = parseFloat(rate.per_min_rate) * durationMinutes;
            const baseFare = parseFloat(rate.base_fare);
            
            let totalFare = (baseFare + distanceFare + timeFare) * surgeMultiplier;
            totalFare = Math.max(totalFare, baseFare); // Ensure a minimum fare.
            const roundedFare = Math.round(totalFare * 100) / 100;

            // 9. Create the secure fareId (JWT) for this specific option.
            const routeHash = createRouteHash(pickup, dropoff);
            const payload = {
                userId,
                fare: roundedFare,
                vehicle: rate.vehicle_category,
                sub_category: rate.sub_category,
                routeHash,
                pickup: { lat: pickup.latitude, lng: pickup.longitude },
                dropoff: { lat: dropoff.latitude, lng: dropoff.longitude },
                trip_distance_km: parseFloat(distanceKm.toFixed(1))
                
            };

            // --- FIX IS HERE ---
            // Replaced the environment variable with a hardcoded '5m' string for clarity and to fix the bug.
            const fareId = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });

            return {
                vehicle_category: rate.vehicle_category,
                sub_category: rate.sub_category,
                display_name: `${rate.vehicle_category} ${rate.sub_category || ''}`.trim(),
                amount: roundedFare,
                fareId,
            };
        });

        // 10. TODO: Apply user-specific promotions.

        return { options: estimates, payment_options: paymentOptions };

    } catch (error) {
        console.error('Error in getFareEstimates:', error);
        // Re-throw the error so the controller can catch it and send a 500 response.
        throw error;
    }
};

module.exports = {
    getFareEstimates,
};