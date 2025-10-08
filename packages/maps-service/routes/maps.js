// packages/maps-service/routes/maps.js
const express = require('express');
const { reverseGeocode, getPlaceAutocomplete, forwardGeocode, getDirections } = require('../controllers/mapsController');
const tokenVerify = require('../middleware/token-verify');

const router = express.Router();

// All routes require a valid user/driver token
router.use(tokenVerify);

// Proxy for Reverse Geocoding
router.get('/geocode/reverse', reverseGeocode);

// Proxy for Places Autocomplete
router.get('/places/autocomplete', getPlaceAutocomplete);

// Proxy for Forward Geocoding
router.get('/geocode/forward', forwardGeocode);

// Proxy for Directions API
router.get('/directions', getDirections);

module.exports = router;