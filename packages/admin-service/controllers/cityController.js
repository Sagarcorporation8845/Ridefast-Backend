// packages/admin-service/controllers/cityController.js
const { query } = require('../db');

const addCity = async (req, res) => {
    const { cityName, status, launchDate } = req.body;
    const standardizedCityName = cityName.trim().toLowerCase();

    try {
        const { rows } = await query(
            'INSERT INTO servicable_cities (city_name, status, launch_date) VALUES ($1, $2, $3) RETURNING *',
            [standardizedCityName, status, launchDate]
        );
        res.status(201).json({ success: true, city: rows[0] });
    } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ success: false, message: 'This city already exists.' });
        }
        console.error('Error adding city:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getCities = async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM servicable_cities ORDER BY city_name');
        res.status(200).json({ success: true, cities: rows });
    } catch (error) {
        console.error('Error fetching cities:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateCity = async (req, res) => {
    const { cityId } = req.params;
    const { status, launchDate } = req.body;

    try {
        const { rows } = await query(
            'UPDATE servicable_cities SET status = $1, launch_date = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
            [status, launchDate, cityId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'City not found' });
        }
        res.status(200).json({ success: true, city: rows[0] });
    } catch (error) {
        console.error('Error updating city:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    addCity,
    getCities,
    updateCity,
};