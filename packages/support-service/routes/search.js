// packages/support-service/routes/search.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const { validateQuery, sanitizeInput } = require('../middleware/queryValidation');

const router = express.Router();

/**
 * @route GET /search
 * @desc Search for drivers or customers by name, phone number, or vehicle number.
 * @access Private (City Admin, Support)
 */
router.get('/', tokenVerify, sanitizeInput, validateQuery('search'), async (req, res) => {
    try {
        const { role, city } = req.user;
        const { type = 'customer', q, page = 1, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'A search query is required.'
            });
        }

        if (role !== 'city_admin' && role !== 'support') {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to perform this action.'
            });
        }

        const offset = (page - 1) * limit;
        let query;
        let countQuery;
        let queryParams;
        let countParams;

        if (type === 'driver') {
            if (!city) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be assigned to a city to search for drivers.'
                });
            }
            
            queryParams = [`%${q}%`, city, limit, offset];
            countParams = [`%${q}%`, city];

            query = `
                SELECT
                    d.id as driver_id,
                    u.full_name,
                    d.city,
                    d.created_at as registration_date,
                    dv.model_name,
                    dv.registration_number,
                    dv.category as vehicle_category
                FROM drivers d
                JOIN users u ON d.user_id = u.id
                LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
                WHERE
                    d.city = $2 AND (
                        u.full_name ILIKE $1 OR
                        u.phone_number ILIKE $1 OR
                        dv.registration_number ILIKE $1
                    )
                ORDER BY u.full_name
                LIMIT $3 OFFSET $4;
            `;

            countQuery = `
                SELECT COUNT(DISTINCT d.id)
                FROM drivers d
                JOIN users u ON d.user_id = u.id
                LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
                WHERE
                    d.city = $2 AND (
                        u.full_name ILIKE $1 OR
                        u.phone_number ILIKE $1 OR
                        dv.registration_number ILIKE $1
                    );
            `;

        } else { // customer
            queryParams = [`%${q}%`, limit, offset];
            countParams = [`%${q}%`]; // Corrected: Only one parameter needed

            query = `
                SELECT
                    u.id as customer_id,
                    u.full_name,
                    u.phone_number,
                    u.email,
                    u.created_at as registration_date
                FROM users u
                LEFT JOIN drivers d ON u.id = d.user_id
                WHERE
                    d.id IS NULL AND (
                        u.full_name ILIKE $1 OR
                        u.phone_number ILIKE $1 OR
                        u.email ILIKE $1
                    )
                ORDER BY u.full_name
                LIMIT $2 OFFSET $3;
            `;

            countQuery = `
                SELECT COUNT(u.id)
                FROM users u
                LEFT JOIN drivers d ON u.id = d.user_id
                WHERE
                    d.id IS NULL AND (
                        u.full_name ILIKE $1 OR
                        u.phone_number ILIKE $1 OR
                        u.email ILIKE $1
                    );
            `;
        }

        const { rows } = await db.query(query, queryParams);
        const countResult = await db.query(countQuery, countParams); // Corrected parameters
        const totalItems = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            [type === 'driver' ? 'drivers' : 'customers']: rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalItems,
            },
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while searching.'
        });
    }
});

module.exports = router;