// packages/pricing-service/services/googleMapsService.js
const axios = require('axios');
const db = require('../db');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DIRECTIONS_API_URL = 'https://maps.googleapis.com/maps/api/directions/json';

// In-memory cache for serviceable cities to reduce DB calls
let serviceableCities = [];
let lastCitiesFetch = 0;
const CITIES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const getServicableCities = async () => {
    if (Date.now() - lastCitiesFetch > CITIES_CACHE_TTL) {
        try {
            const { rows } = await db.query("SELECT city_name FROM servicable_cities WHERE status = 'active'");
            serviceableCities = rows.map(row => row.city_name.toLowerCase());
            lastCitiesFetch = Date.now();
            console.log('[pricing-service] Refreshed serviceable cities cache:', serviceableCities);
        } catch (error) {
            console.error("[pricing-service] Failed to refresh serviceable cities cache:", error);
        }
    }
    return serviceableCities;
}

// Determines which city the coordinates fall into
const getCityFromCoordinates = async (latitude, longitude) => {
    try {
        const cities = await getServicableCities();
        if (!cities || cities.length === 0) {
            console.error('[pricing-service] No serviceable cities found in the database or cache.');
            return null;
        }

        const response = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json`, {
            params: {
                latlng: `${latitude},${longitude}`,
                key: GOOGLE_MAPS_API_KEY,
                result_type: 'locality|administrative_area_level_2|administrative_area_level_3' // Request more address types
            }
        });

        if (response.data.error_message) {
            console.error('[pricing-service] Google Geocoding API Error:', response.data.error_message);
            return null;
        }

        // --- START OF UPDATED LOGIC ---
        // This logic is now more flexible.
        if (response.data.results && response.data.results.length > 0) {
            for (const result of response.data.results) {
                for (const component of result.address_components) {
                    const componentCityName = component.long_name.toLowerCase();
                    // Check if the component is a city we service
                    if (cities.includes(componentCityName)) {
                         // Check if the component type is one we trust for city names
                        const isCityComponent = component.types.includes('locality') ||
                                                component.types.includes('administrative_area_level_2') ||
                                                component.types.includes('administrative_area_level_3');
                        
                        if (isCityComponent) {
                            console.log(`[pricing-service] Matched coordinates to city: ${componentCityName}`);
                            return componentCityName;
                        }
                    }
                }
            }
        }
        // --- END OF UPDATED LOGIC ---

        console.warn(`[pricing-service] Coordinates ${latitude},${longitude} do not fall into any serviceable city.`);
        return null; // Not in a serviceable city

    } catch (error) {
        console.error("[pricing-service] Error in getCityFromCoordinates:", error.response ? error.response.data : error.message);
        return null;
    }
}


const getRouteDetails = async (pickup, dropoff) => {
    try {
        const city = await getCityFromCoordinates(pickup.latitude, pickup.longitude);
        if (!city) {
            console.error('[pricing-service] getRouteDetails failed because no serviceable city could be determined for the pickup coordinates.');
            return null;
        }

        const response = await axios.get(DIRECTIONS_API_URL, {
            params: {
                origin: `${pickup.latitude},${pickup.longitude}`,
                destination: `${dropoff.latitude},${dropoff.longitude}`,
                key: GOOGLE_MAPS_API_KEY,
                units: 'metric',
            },
        });

        if (response.data.error_message) {
            console.error('[pricing-service] Google Directions API Error:', response.data.error_message);
            throw new Error(`Directions API Error: ${response.data.error_message}`);
        }

        if (response.data.status !== 'OK' || !response.data.routes || response.data.routes.length === 0) {
            throw new Error(`Directions API responded with status: ${response.data.status}`);
        }

        const route = response.data.routes[0].legs[0];
        const distanceKm = route.distance.value / 1000;
        const durationMinutes = route.duration.value / 60;

        return {
            distanceKm,
            durationMinutes,
            city,
        };

    } catch (error) {
        console.error("[pricing-service] Error fetching route details from Google Maps:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        return null;
    }
};

module.exports = {
    getRouteDetails,
};