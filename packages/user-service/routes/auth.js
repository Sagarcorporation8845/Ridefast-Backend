// packages/user-service/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

/**
 * @route POST /auth/login
 * @desc Validates phone number and simulates sending an OTP.
 */
router.post('/login', async (req, res) => {
  const { countryCode, phoneNumber } = req.body;

  // --- Added robust validation ---
  if (!phoneNumber || !countryCode) {
    return res.status(400).json({ message: 'Country code and phone number are required.' });
  }

  // Regex to check if the phone number is exactly 10 digits
  if (!/^\d{10}$/.test(phoneNumber)) {
    return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
  }
  // --- End of validation ---

  const fullPhoneNumber = `${countryCode}${phoneNumber}`;
  const mockOtp = '1234';
  console.log(`Simulating OTP for ${fullPhoneNumber}: ${mockOtp}`);
  
  res.status(200).json({ message: `OTP sent successfully. Use ${mockOtp} to verify.` });
});

/**
 * @route POST /auth/verify-otp
 * @desc Verifies OTP, creates a user if they don't exist, and returns a JWT.
 */
router.post('/verify-otp', async (req, res) => {
  const { countryCode, phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp || !countryCode) {
    return res.status(400).json({ message: 'Country code, phone number, and OTP are required.' });
  }

  const mockOtp = '1234';
  if (otp !== mockOtp) {
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

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        role: user.role,
      },
    });

  } catch (err) {
    console.error('Error in /verify-otp:', err);
    res.status(500).json({ message: 'Internal server error. Please check database connection and query.' });
  }
});

module.exports = router;