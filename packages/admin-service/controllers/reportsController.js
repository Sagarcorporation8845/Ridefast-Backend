// packages/admin-service/controllers/reportsController.js
const { query } = require('../db');

/**
 * Helper function to build a dynamic WHERE clause for filtering by city
 * and a custom date range.
 */
const buildReportFilters = (req, dateColumn, tableAlias = null) => {
    const { city, startDate, endDate } = req.query;
    
    let whereConditions = [];
    const params = [];
    let paramIndex = 1;

    // --- City Filter ---
    if (city && city.toLowerCase() !== 'all') {
        const cityColumn = tableAlias ? `${tableAlias}.city` : 'city';
        // Use LOWER and TRIM for robust matching
        whereConditions.push(`LOWER(TRIM(${cityColumn})) = LOWER(TRIM($${paramIndex++}))`);
        params.push(city);
    }

    // --- Date Filter ---
    if (startDate && endDate) {
        whereConditions.push(`${dateColumn} >= $${paramIndex++}`);
        params.push(startDate);
        whereConditions.push(`${dateColumn} < $${paramIndex++}`);
        params.push(endDate);
    } else {
        // Default to "Last 30 days" if no range is provided
        whereConditions.push(`${dateColumn} >= NOW() - INTERVAL '30 days'`);
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    
    return { whereClause, params };
};


/**
 * 1. API for "Ride Statistics" Cards
 * (NOW supports custom date ranges)
 */
const getRideStatistics = async (req, res) => {
    try {
        // We join drivers (alias 'd') and filter by ride creation date ('r.created_at')
        const { whereClause, params } = buildReportFilters(req, 'r.created_at', 'd');

        const queryText = `
            SELECT
                COUNT(r.id) AS total_rides,
                COUNT(CASE WHEN r.status = 'completed' THEN 1 END) AS completed_rides,
                COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) AS cancelled_rides,
                COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) AS total_revenue,
                COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) AS avg_revenue_per_ride
            FROM rides r
            LEFT JOIN drivers d ON r.driver_id = d.id
            ${whereClause}
        `;
        
        const { rows } = await query(queryText, params);
        res.json({ success: true, data: rows[0] });

    } catch (err) {
        console.error('Error fetching ride statistics:', err);
        res.status(500).json({ message: 'Error fetching ride statistics', error: err.message });
    }
};

/**
 * 2. API for "Driver & Registration" Cards
 * (NOW supports custom date ranges for NEW users/drivers)
 */
const getRegistrationSummary = async (req, res) => {
    try {
        const { city } = req.query;

        // --- Query 1: Active Drivers (Point-in-time, city filter only) ---
        let activeDriversWhere = "WHERE status = 'active'";
        const activeDriversParams = [];
        if (city && city.toLowerCase() !== 'all') {
            activeDriversWhere += ` AND LOWER(TRIM(city)) = LOWER(TRIM($1))`;
            activeDriversParams.push(city);
        }
        const activeDriversQuery = `SELECT COUNT(*) as count FROM drivers ${activeDriversWhere}`;
        
        // --- Query 2: New Customers (Date range filter, no city filter) ---
        const { whereClause: newCustWhere, params: newCustParams } = buildReportFilters(req, 'created_at');
        const newCustomersQuery = `SELECT COUNT(*) as count FROM users ${newCustWhere}`;
        
        // --- Query 3: New Drivers (Date range AND city filter) ---
        const { whereClause: newDriverWhere, params: newDriverParams } = buildReportFilters(req, 'created_at', 'd'); // Use alias 'd'
        const newDriversQuery = `SELECT COUNT(*) as count FROM drivers d ${newDriverWhere}`;

        // Run all three queries in parallel
        const [
            activeDriversResult, 
            newCustomersResult, 
            newDriversResult
        ] = await Promise.all([
            query(activeDriversQuery, activeDriversParams),
            query(newCustomersQuery, newCustParams),
            query(newDriversQuery, newDriverParams)
        ]);

        res.json({
            success: true,
            data: {
                activeDrivers: parseInt(activeDriversResult.rows[0].count, 10),
                newCustomers: parseInt(newCustomersResult.rows[0].count, 10),
                newDrivers: parseInt(newDriversResult.rows[0].count, 10)
            }
        });
    } catch (err) {
        console.error('Error fetching registration summary:', err);
        res.status(500).json({ message: 'Error fetching registration summary', error: err.message });
    }
};

/**
 * 3. API for "Revenue Over Time" Graph
 * (Already supports custom date ranges)
 */
const getRevenueOverTime = async (req, res) => {
    try {
        const { city, startDate, endDate } = req.query;
        
        let queryText;
        const params = [];
        let paramIndex = 1;

        let whereConditions = [];

        // --- City Filter ---
        if (city && city.toLowerCase() !== 'all') {
            whereConditions.push(`LOWER(d.city) = LOWER($${paramIndex++})`);
            params.push(city);
        }

        if (startDate && endDate) {
            // --- SCENARIO 1: CUSTOM DATE RANGE (Group by DAY) ---
            params.push(startDate, endDate); 
            whereConditions.push(`r.created_at >= $${paramIndex++}`);
            whereConditions.push(`r.created_at < $${paramIndex++}`);
            
            const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

            queryText = `
                WITH all_days AS (
                    SELECT generate_series($${paramIndex - 2}::date, $${paramIndex - 1}::date, '1 day')::date as day
                ),
                ride_data AS (
                    SELECT 
                        DATE_TRUNC('day', r.created_at)::date as day,
                        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as total_revenue,
                        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides
                    FROM rides r
                    LEFT JOIN drivers d ON r.driver_id = d.id
                    ${whereClause} AND r.status = 'completed'
                    GROUP BY 1
                )
                SELECT 
                    to_char(d.day, 'YYYY-MM-DD') as date, 
                    COALESCE(rd.total_revenue, 0)::float as total_revenue,
                    COALESCE(rd.completed_rides, 0)::int as completed_rides
                FROM all_days d
                LEFT JOIN ride_data rd ON d.day = rd.day
                ORDER BY d.day ASC;
            `;
            
        } else {
            // --- SCENARIO 2: DEFAULT (CURRENT YEAR BY MONTH) ---
            whereConditions.push(`r.created_at >= DATE_TRUNC('year', NOW() AT TIME ZONE 'UTC')`);
            whereConditions.push(`r.created_at < DATE_TRUNC('year', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 year'`);
            
            const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

            queryText = `
                WITH all_months AS (
                    SELECT 
                        month_num,
                        to_char(to_date(month_num::text, 'MM'), 'Mon') as month_name
                    FROM generate_series(1, 12) as month_num
                ),
                ride_data AS (
                    SELECT 
                        EXTRACT(MONTH FROM r.created_at) as month,
                        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as total_revenue,
                        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides
                    FROM rides r
                    LEFT JOIN drivers d ON r.driver_id = d.id
                    ${whereClause} AND r.status = 'completed'
                    GROUP BY 1
                )
                SELECT 
                    m.month_num as month,
                    m.month_name,
                    COALESCE(rd.total_revenue, 0)::float as total_revenue,
                    COALESCE(rd.completed_rides, 0)::int as completed_rides
                FROM all_months m
                LEFT JOIN ride_data rd ON m.month_num = rd.month
                ORDER BY m.month_num ASC;
            `;
        }
        
        const { rows } = await query(queryText, params);
        res.json({ success: true, data: rows });

    } catch (err) {
        console.error('Error fetching revenue over time:', err);
        res.status(500).json({ message: 'Error fetching revenue over time', error: err.message });
    }
};

module.exports = {
    getRideStatistics,
    getRegistrationSummary,
    getRevenueOverTime
};