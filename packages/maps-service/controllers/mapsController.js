// packages/maps-service/controllers/mapsController.js
const googleProxyService = require('../services/googleProxyService');

const reverseGeocode = async (req, res) => {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ message: 'lat and lng query parameters are required.' });
    }

    try {
        const data = await googleProxyService.reverseGeocode(lat, lng);
        res.status(200).json(data);
    } catch (error) {
        console.error('Reverse geocode proxy error:', error);
        res.status(error.response?.status || 500).json({ message: 'Error fetching geocode data.' });
    }
};

const getPlaceAutocomplete = async (req, res) => {
    const { input, sessiontoken, lat, lng } = req.query;

    if (!input) {
        return res.status(400).json({ message: 'input query parameter is required.' });
    }

    try {
        const data = await googleProxyService.getPlaceAutocomplete(input, sessiontoken, lat, lng);
        res.status(200).json(data);
    } catch (error) {
        console.error('Place autocomplete proxy error:', error);
        res.status(error.response?.status || 500).json({ message: 'Error fetching autocomplete data.' });
    }
};

const forwardGeocode = async (req, res) => {
    const { address } = req.query;

    if (!address) {
        return res.status(400).json({ message: 'address query parameter is required.' });
    }

    try {
        const data = await googleProxyService.forwardGeocode(address);
        res.status(200).json(data);
    } catch (error) {
        console.error('Forward geocode proxy error:', error);
        res.status(error.response?.status || 500).json({ message: 'Error fetching geocode data.' });
    }
};

const getDirections = async (req, res) => {
    const { originLat, originLng, destinationLat, destinationLng } = req.query;

    if (!originLat || !originLng || !destinationLat || !destinationLng) {
        return res.status(400).json({ message: 'originLat, originLng, destinationLat, and destinationLng are required.' });
    }

    try {
        const data = await googleProxyService.getRouteDetails(originLat, originLng, destinationLat, destinationLng);
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ message: 'Error fetching directions data.' });
    }
};


module.exports = {
    reverseGeocode,
    getPlaceAutocomplete,
    forwardGeocode,
    getDirections, // Export the new controller
};