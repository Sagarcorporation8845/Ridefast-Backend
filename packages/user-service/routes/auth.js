// packages/user-service/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sanitizeInput, validateBody } = require('../middleware/validation');

const router = express.Router();

/**
 * @route POST /auth/login
 * @desc Validates phone number and simulates sending a dynamic OTP.
 */
router.post('/login', sanitizeInput, validateBody('authLogin'), async (req, res) => {
  const { countryCode, phoneNumber } = req.body;

  const dynamicOtp = phoneNumber.slice(-4);
  const fullPhoneNumber = `${countryCode}${phoneNumber}`;

  console.log(`Simulating OTP for ${fullPhoneNumber}: ${dynamicOtp}`);
  
  res.status(200).json({ 
    message: `OTP sent successfully. For testing, use OTP: ${dynamicOtp}` 
  });
});

/**
 * @route POST /auth/verify-otp
 * @desc Verifies OTP, creates/finds a user, checks for a driver profile, and returns a JWT with a list of roles.
 */
router.post('/verify-otp', sanitizeInput, validateBody('authVerifyOtp'), async (req, res) => {
  const { countryCode, phoneNumber, otp } = req.body;

  const expectedOtp = phoneNumber.slice(-4);
  if (otp !== expectedOtp) {
    return res.status(401).json({ message: 'Invalid OTP.' });
  }

  const fullPhoneNumber = `${countryCode}${phoneNumber}`;

  try {
    // Find or create the user in the 'users' table
    let userResult = await db.query('SELECT * FROM users WHERE phone_number = $1', [fullPhoneNumber]);
    let user = userResult.rows[0];

    if (!user) {
      // If the user does not exist, create a new one. By default, they are a customer.
      const newUserResult = await db.query(
        'INSERT INTO users (phone_number) VALUES ($1) RETURNING *',
        [fullPhoneNumber]
      );
      user = newUserResult.rows[0];
      
      // Also create a wallet for the new user
      await db.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [user.id, 0.00]);
      console.log(`New user and wallet created for ${fullPhoneNumber}`);
    }

    // Now, check if this user has a driver profile
    const driverResult = await db.query('SELECT * FROM drivers WHERE user_id = $1', [user.id]);
    const isDriver = driverResult.rows.length > 0;

    // Determine the user's roles
    const roles = ['customer'];
    if (isDriver) {
      roles.push('driver');
    }

    // A user's profile is considered complete if their full_name is not null
    const isProfileComplete = user.full_name != null;

    // Create a JWT that includes the user's roles
    const token = jwt.sign(
      { userId: user.id, roles: roles }, // Include roles in the token payload
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return the token and user information, including the list of roles
    res.status(200).json({
      message: 'Login successful!',
      token,
      isProfileComplete,
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        fullName: user.full_name,
        roles: roles, // The client app will use this to determine the user experience
      },
    });

  } catch (err) {
    console.error('Error in /verify-otp:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;