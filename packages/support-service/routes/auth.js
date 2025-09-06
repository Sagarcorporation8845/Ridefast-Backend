// packages/support-service/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

/**
 * @route POST /auth/login
 * @desc Authenticates a platform staff member (admin or support) and returns a JWT.
 * @access Public
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  // Enforce the company domain for security
  if (!email.endsWith('@zenevo.in')) {
      return res.status(400).json({ message: 'Invalid email domain. Access denied.' });
  }

  try {
    // Query the new 'platform_staff' table instead of 'support_agents'
    const result = await db.query('SELECT * FROM platform_staff WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      // User not found
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const staffMember = result.rows[0];

    // Check if the account is active
    if (staffMember.status !== 'active') {
        return res.status(403).json({ message: 'Your account is suspended. Please contact a central admin.' });
    }

    // Compare the provided password with the securely stored hash
    const isMatch = await bcrypt.compare(password, staffMember.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Create the JWT payload with the necessary information for role-based access control
    const payload = {
      agentId: staffMember.id,
      role: staffMember.role,
      city: staffMember.city // The 'city' is crucial for scoping access later
    };

    // Sign the token with a secret key and set an expiration time
    const token = jwt.sign(
      payload, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' } // Token is valid for an 8-hour shift
    );

    // Send a success response with the token and user info for the frontend
    res.status(200).json({
      message: 'Login successful!',
      token,
      agent: {
        fullName: staffMember.full_name,
        email: staffMember.email,
        role: staffMember.role,
        city: staffMember.city
      },
    });

  } catch (err) {
    console.error('Login error in support-service:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;

