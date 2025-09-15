// packages/user-service/routes/profile.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify'); 

const router = express.Router();

/**
 * @route GET /profile
 * @desc Gets the complete profile data for the authenticated user.
 * @access Private (requires token)
 */
router.get('/', tokenVerify, async (req, res) => {
  const userId = req.user.userId;

  try {
    const query = `
      SELECT 
        id, 
        full_name, 
        email, 
        phone_number,
        date_of_birth, 
        gender,
        home_address,
        home_latitude,
        home_longitude,
        work_address,
        work_latitude,
        work_longitude
      FROM users 
      WHERE id = $1
    `;
    const { rows } = await db.query(query, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: 'Profile data retrieved successfully!',
      user: rows[0],
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});


/**
 * @route PUT /profile/update
 * @desc Updates the profile details for the authenticated user.
 * @access Private (requires token)
 */
router.put('/update', tokenVerify, async (req, res) => {
  const { fullName, email, dob, gender } = req.body;
  const userId = req.user.userId;

  if (!fullName || !email || !dob || !gender) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  try {
    const query = `
      UPDATE users 
      SET full_name = $1, email = $2, date_of_birth = $3, gender = $4 
      WHERE id = $5 
      RETURNING id, full_name, email, phone_number, date_of_birth, gender
    `;
    const { rows } = await db.query(query, [fullName, email, dob, gender, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: 'Profile updated successfully!',
      user: rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
        return res.status(409).json({ message: 'An account with this email address already exists.' });
    }
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;