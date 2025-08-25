// packages/user-service/routes/profile.js
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * @route PUT /profile/update
 * @desc Updates the profile details (full name, email, dob, gender) for the authenticated user.
 * @access Private (requires JWT token)
 */
router.put('/update', authMiddleware, async (req, res) => {
  const { fullName, email, dob, gender } = req.body;
  const userId = req.user.userId; // Get user ID from the token payload

  // --- Server-side validation ---
  if (!fullName || !email || !dob || !gender) {
    return res.status(400).json({ message: 'Full name, email, date of birth, and gender are required.' });
  }

  // A simple regex to validate email format
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  try {
    const query = `
      UPDATE users 
      SET full_name = $1, email = $2, date_of_birth = $3, gender = $4 
      WHERE id = $5 
      RETURNING id, full_name, email, phone_number, role, date_of_birth, gender
    `;
    
    const { rows } = await db.query(
      query,
      [fullName, email, dob, gender, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: 'Profile updated successfully!',
      user: rows[0],
    });
  } catch (err) {
    // Check for unique constraint violation (e.g., email already exists)
    if (err.code === '23505') { // PostgreSQL unique violation error code
        return res.status(409).json({ message: 'An account with this email address already exists.' });
    }
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;