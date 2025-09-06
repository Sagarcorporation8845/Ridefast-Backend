// packages/driver-service/routes/profile.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify'); 

const router = express.Router();

/**
 * @route GET /profile/
 * @desc Gets the consolidated profile data for the authenticated driver.
 * @access Private (requires token)
 */
router.get('/', tokenVerify, async (req, res) => {
  const userId = req.user.userId;

  try {
    const query = `
      SELECT 
        u.full_name, 
        u.email, 
        u.phone_number,
        dv.model_name,
        dv.registration_number,
        dv.category as vehicle_type,
        d.city,
        d.status as driver_status
      FROM users u
      JOIN drivers d ON u.id = d.user_id
      LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
      WHERE u.id = $1
    `;
    const { rows } = await db.query(query, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver profile not found.' });
    }

    res.status(200).json({
      message: 'Driver profile data retrieved successfully!',
      profile: rows[0],
    });
  } catch (err) {
    console.error('Error fetching driver profile:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;