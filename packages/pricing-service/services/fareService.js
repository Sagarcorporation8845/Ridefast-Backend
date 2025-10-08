// packages/pricing-service/services/fareService.js
const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const googleMapsService = require('./googleMapsService');

const createRouteHash = (pickup, dropoff) => {
    const routeString = `${pickup.latitude},${pickup.longitude}|${dropoff.latitude},${dropoff.longitude}`;
    return crypto.createHash('sha256').update(routeString).digest('hex');
};

const getFareEstimates = async (pickup, dropoff, userId) => {
    try {
        const routeDetails = await googleMapsService.getRouteDetails(pickup, dropoff);

        const walletResult = await db.query(
            `SELECT balance FROM wallets WHERE user_id = $1`,
            [userId]
        );
        const walletBalance = walletResult.rows[0]?.balance || 0;

        if (!routeDetails) {
            return {
                payment_options: {
                    wallet: {
                        is_available: false,
                        balance: parseFloat(walletBalance)
                    }
                },
                options: [],
                polyline: null
            };
        }

        const { distanceKm, durationMinutes, city, encodedPolyline } = routeDetails;

        const cityConfigResult = await db.query(
            `SELECT wallet_enabled FROM servicable_cities WHERE LOWER(city_name) = LOWER($1)`,
            [city]
        );
        const isWalletAvailableForCity = cityConfigResult.rows[0]?.wallet_enabled || false;

        const paymentOptions = {
            wallet: {
                is_available: isWalletAvailableForCity,
                balance: parseFloat(walletBalance)
            }
        };

        const ratesResult = await db.query(
            `SELECT vehicle_category, sub_category, base_fare, per_km_rate, per_min_rate 
             FROM vehicle_rates 
             WHERE LOWER(city_name) = LOWER($1) AND is_active = true`,
            [city]
        );

        if (ratesResult.rows.length === 0) {
            return { options: [], payment_options: paymentOptions, polyline: encodedPolyline };
        }

        const surgeMultiplier = 1.0;

        const estimates = ratesResult.rows.map(rate => {
            const distanceFare = parseFloat(rate.per_km_rate) * distanceKm;
            const timeFare = parseFloat(rate.per_min_rate) * durationMinutes;
            const baseFare = parseFloat(rate.base_fare);
            
            let totalFare = (baseFare + distanceFare + timeFare) * surgeMultiplier;
            totalFare = Math.max(totalFare, baseFare); 
            const roundedFare = Math.round(totalFare * 100) / 100;

            const routeHash = createRouteHash(pickup, dropoff);
            
            // The JWT payload is now much smaller
            const payload = {
                userId,
                fare: roundedFare,
                vehicle: rate.vehicle_category,
                sub_category: rate.sub_category,
                routeHash,
                pickup: { lat: pickup.latitude, lng: pickup.longitude },
                dropoff: { lat: dropoff.latitude, lng: dropoff.longitude },
                trip_distance_km: parseFloat(distanceKm.toFixed(1)),
                city: city,
            };

            const fareId = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });

            return {
                vehicle_category: rate.vehicle_category,
                sub_category: rate.sub_category,
                display_name: `${rate.vehicle_category} ${rate.sub_category || ''}`.trim(),
                amount: roundedFare,
                fareId,
            };
        });

        return { options: estimates, payment_options: paymentOptions, polyline: encodedPolyline };

    } catch (error) {
        console.error('Error in getFareEstimates:', error);
        throw error;
    }
};

module.exports = {
    getFareEstimates,
};