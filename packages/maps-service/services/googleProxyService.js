// packages/maps-service/services/googleProxyService.js
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
            console.log('[maps-service] Refreshed serviceable cities cache:', serviceableCities);
        } catch (error) {
            console.error("[maps-service] Failed to refresh serviceable cities cache:", error);
        }
    }
    return serviceableCities;
}

// Determines which city the coordinates fall into
const getCityFromCoordinates = async (latitude, longitude) => {
    try {
        const cities = await getServicableCities();
        if (!cities || cities.length === 0) {
            console.error('[maps-service] No serviceable cities found in the database or cache.');
            return null;
        }

        const response = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json`, {
            params: {
                latlng: `${latitude},${longitude}`,
                key: GOOGLE_MAPS_API_KEY,
                result_type: 'locality|administrative_area_level_2|administrative_area_level_3'
            }
        });

        if (response.data.error_message) {
            console.error('[maps-service] Google Geocoding API Error:', response.data.error_message);
            return null;
        }

        if (response.data.results && response.data.results.length > 0) {
            for (const result of response.data.results) {
                for (const component of result.address_components) {
                    const componentCityName = component.long_name.toLowerCase();
                    if (cities.includes(componentCityName)) {
                        const isCityComponent = component.types.includes('locality') ||
                                                component.types.includes('administrative_area_level_2') ||
                                                component.types.includes('administrative_area_level_3');
                        
                        if (isCityComponent) {
                            console.log(`[maps-service] Matched coordinates to city: ${componentCityName}`);
                            return componentCityName;
                        }
                    }
                }
            }
        }

        console.warn(`[maps-service] Coordinates ${latitude},${longitude} do not fall into any serviceable city.`);
        return null;

    } catch (error) {
        console.error("[maps-service] Error in getCityFromCoordinates:", error.response ? error.response.data : error.message);
        return null;
    }
}

const reverseGeocode = async (lat, lng) => {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
            latlng: `${lat},${lng}`,
            key: GOOGLE_MAPS_API_KEY,
        }
    });
    return response.data;
};

const forwardGeocode = async (address) => {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
            address,
            key: GOOGLE_MAPS_API_KEY,
        }
    });
    return response.data;
};

const getPlaceAutocomplete = async (input, sessiontoken, lat, lng) => {
    const params = {
        input,
        sessiontoken,
        key: GOOGLE_MAPS_API_KEY,
        components: 'country:in', // Strictly limit results to India
    };

    if (lat && lng) {
        params.location = `${lat},${lng}`;
        params.radius = 50000; // Bias results within a 50km radius
        params.strictbounds = false; // Allows results outside the radius if highly relevant
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
        params
    });
    return response.data;
};

const getRouteDetails = async (originLat, originLng, destinationLat, destinationLng) => {
    try {
        const response = await axios.get(DIRECTIONS_API_URL, {
            params: {
                origin: `${originLat},${originLng}`,
                destination: `${destinationLat},${destinationLng}`,
                key: GOOGLE_MAPS_API_KEY,
                units: 'metric',
            },
        });
        return response.data;
    } catch (error) {
        console.error("[maps-service] Error fetching directions:", error.response ? error.response.data : error.message);
        throw error;
    }
};


module.exports = {
    reverseGeocode,
    forwardGeocode,
    getPlaceAutocomplete,
    getCityFromCoordinates,
    getRouteDetails, // Export the new function
};