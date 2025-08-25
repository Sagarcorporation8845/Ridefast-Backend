// packages/user-service/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

/**
 * @route POST /auth/login
 * @desc Validates phone number and simulates sending a dynamic OTP.
 */
router.post('/login', async (req, res) => {
  const { countryCode, phoneNumber } = req.body;

  if (!phoneNumber || !countryCode) {
    return res.status(400).json({ message: 'Country code and phone number are required.' });
  }

  if (!/^\d{10}$/.test(phoneNumber)) {
    return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
  }

  // --- FIX: Dynamic OTP Generation ---
  // The OTP is now the last 4 digits of the phone number.
  const dynamicOtp = phoneNumber.slice(-4);
  const fullPhoneNumber = `${countryCode}${phoneNumber}`;

  console.log(`Simulating OTP for ${fullPhoneNumber}: ${dynamicOtp}`);
  
  // In the response, we'll tell the frontend what the OTP is for easy testing.
  res.status(200).json({ 
    message: `OTP sent successfully. For testing, use OTP: ${dynamicOtp}` 
  });
});

/**
 * @route POST /auth/verify-otp
 * @desc Verifies OTP, creates/finds a user, and returns a JWT with a profile completion flag.
 */
router.post('/verify-otp', async (req, res) => {
  const { countryCode, phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp || !countryCode) {
    return res.status(400).json({ message: 'Country code, phone number, and OTP are required.' });
  }

  // --- FIX: Verify against the dynamic OTP ---
  const expectedOtp = phoneNumber.slice(-4);
  if (otp !== expectedOtp) {
    return res.status(401).json({ message: 'Invalid OTP.' });
  }

  const fullPhoneNumber = `${countryCode}${phoneNumber}`;

  try {
    let userResult = await db.query('SELECT * FROM users WHERE phone_number = $1', [fullPhoneNumber]);
    let user = userResult.rows[0];

    if (!user) {
      const newUserResult = await db.query(
        'INSERT INTO users (phone_number, role) VALUES ($1, $2) RETURNING *',
        [fullPhoneNumber, 'customer']
      );
      user = newUserResult.rows[0];
      
      await db.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [user.id, 0.00]);
      console.log(`New user and wallet created for ${fullPhoneNumber}`);
    }

    // --- FIX: Add the profile completion flag ---
    // The profile is considered complete if the 'full_name' field is not null.
    const isProfileComplete = user.full_name != null;

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // The new response includes the 'isProfileComplete' flag.
    res.status(200).json({
      message: 'Login successful!',
      token,
      isProfileComplete, // <-- CRITICAL NEW FIELD
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        role: user.role,
        fullName: user.full_name, // Also return the name if it exists
      },
    });

  } catch (err) {
    console.error('Error in /verify-otp:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;