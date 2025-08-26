// packages/user-service/routes/locations.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');

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
