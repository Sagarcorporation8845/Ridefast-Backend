// packages/user-service/routes/locations.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const axios = require('axios');
const LOCATION_SERVICE_URL = process.env.LOCATION_SERVICE_URL || 'http://localhost:3006';
const SIGNALING_SERVICE_URL = process.env.SIGNALING_SERVICE_URL || 'http://localhost:3005';

const router = express.Router();

/**
 * @route PUT /locations/save
 * @desc Saves or updates a user's home or work location.
 * @access Private (requires token)
 */
router.put('/save', tokenVerify, async (req, res) => {
  const { type, address, latitude, longitude } = req.body;
  const userId = req.user.userId;

  // 1. Validate input
  if (!type || !address || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ message: 'type, address, latitude, and longitude are required.' });
  }

  if (type !== 'home' && type !== 'work') {
    return res.status(400).json({ message: 'Invalid location type. Must be "home" or "work".' });
  }

  // 2. Construct the dynamic query based on the type
  const fieldsToUpdate = {
    [`${type}_address`]: address,
    [`${type}_latitude`]: latitude,
    [`${type}_longitude`]: longitude,
  };

  // Build the SET part of the SQL query dynamically and safely
  const setClauses = Object.keys(fieldsToUpdate).map((key, index) => `${key} = $${index + 1}`);
  const queryValues = Object.values(fieldsToUpdate);
  queryValues.push(userId); // Add userId for the WHERE clause

  const queryText = `
    UPDATE users 
    SET ${setClauses.join(', ')} 
    WHERE id = $${queryValues.length}
    RETURNING id, home_address, home_latitude, home_longitude, work_address, work_latitude, work_longitude
  `;

  // 3. Execute the query
  try {
    const { rows } = await db.query(queryText, queryValues);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} location saved successfully!`,
      locations: rows[0],
    });
  } catch (err) {
    console.error(`Error saving ${type} location:`, err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;

/**
 * @route POST /locations/nearby-drivers
 * @desc Finds nearby drivers via Redis (signaling-service) and returns ETAs using location-service
 * @access Public (or Private if needed)
 */
router.post('/nearby-drivers', async (req, res) => {
  try {
    const { pickup, city, vehicleType, radiusKm = 5 } = req.body;

    if (!pickup || pickup.lat === undefined || pickup.lng === undefined) {
      return res.status(400).json({ message: 'pickup {lat,lng} is required' });
    }
    if (!city || !vehicleType) {
      return res.status(400).json({ message: 'city and vehicleType are required' });
    }

    // 1) Ask signaling-service for nearby drivers with coordinates
    const nearbyResp = await axios.post(`${SIGNALING_SERVICE_URL}/nearby-drivers`, {
      pickupLocation: { lat: pickup.lat, lng: pickup.lng },
      city,
      vehicleType,
      radius: radiusKm
    });

    const drivers = nearbyResp.data?.drivers || [];
    if (drivers.length === 0) {
      return res.json({ drivers: [], etas: [], count: 0 });
    }

    // 2) Build origins list for Distance Matrix (driver coords)
    const origins = drivers
      .filter(d => d.coordinates && d.coordinates.lat !== undefined && d.coordinates.lng !== undefined)
      .map(d => `${d.coordinates.lat},${d.coordinates.lng}`);

    if (origins.length === 0) {
      return res.json({ drivers: [], etas: [], count: 0 });
    }

    const destination = `${pickup.lat},${pickup.lng}`;

    // 3) Call location-service distance-matrix once for all drivers
    const dmResp = await axios.post(`${LOCATION_SERVICE_URL}/distance-matrix`, {
      origins,
      destination,
      mode: 'driving'
    });

    const rows = dmResp.data?.rows || [];

    // 4) Pair ETAs back to drivers
    const results = drivers.slice(0, rows.length).map((driver, idx) => {
      const elements = rows[idx]?.elements?.[0];
      return {
        driverId: driver.driverId,
        vehicleType: driver.vehicleType,
        city: driver.city,
        coordinates: driver.coordinates,
        distanceText: elements?.distance?.text,
        distanceMeters: elements?.distance?.value,
        durationText: elements?.duration?.text,
        durationSeconds: elements?.duration?.value
      };
    }).filter(r => r.durationSeconds !== undefined);

    // 5) Sort by ETA ascending
    results.sort((a, b) => a.durationSeconds - b.durationSeconds);

    res.json({
      count: results.length,
      drivers: results
    });
  } catch (err) {
    console.error('Error getting nearby drivers/ETAs:', err.message);
    res.status(500).json({ message: 'Failed to get nearby drivers', error: err.message });
  }
});
