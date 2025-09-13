// packages/support-service/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

/**
 * @route POST /auth/login
 * @desc Authenticates a platform staff member and returns a JWT.
 * @access Public
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!email.endsWith('@zenevo.in')) {
      return res.status(400).json({ message: 'Invalid email domain. Access denied.' });
  }

  try {
    const result = await db.query('SELECT * FROM platform_staff WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const staffMember = result.rows[0];

    if (staffMember.status !== 'active') {
        return res.status(403).json({ message: 'Your account is suspended. Please contact a central admin.' });
    }

    const isMatch = await bcrypt.compare(password, staffMember.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Create the JWT payload with all necessary authorization info
    const payload = {
      agentId: staffMember.id,
      role: staffMember.role,
      city: staffMember.role === 'central_admin' ? 'Central' : staffMember.city
    };

    const token = jwt.sign(
      payload, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );

    res.status(200).json({
      message: 'Login successful!',
      token,
      agent: {
        fullName: staffMember.full_name,
        email: staffMember.email,
        // "role" and "city" have been removed from this response object.
      },
    });

  } catch (err) {
    console.error('Login error in support-service:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;

