// packages/admin-service/routes/cities.js
const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { addCity, getCities, updateCity } = require('../controllers/cityController');

const router = express.Router();

// All routes in this file are protected and require a central_admin role
router.use(authenticateToken, requireRole(['central_admin']));

router.post('/', addCity);
router.get('/', getCities);
router.put('/:cityId', updateCity);

module.exports = router;