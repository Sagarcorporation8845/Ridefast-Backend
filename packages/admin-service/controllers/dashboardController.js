const { query } = require('../db');

// Helper function to build dynamic city filters
const buildCityFilter = (city, tableAlias = 'st', paramIndex = 1) => {
    let cityFilter = '';
    const params = [];

    if (city) {
        cityFilter = `WHERE LOWER(${tableAlias}.city) = LOWER($${paramIndex})`;
        params.push(city);
    }
    return { cityFilter, params };
};

// Dashboard Overview Stats
const getOverviewStats = async (req, res) => {
    try {
        const { city } = req.query; // Optional city filter

        const params = [];
        let cityFilter = '';
        let cityFilterAnd = '';

        if (city) {
            params.push(city);
            cityFilter = `WHERE LOWER(d.city) = LOWER($1)`;
            cityFilterAnd = `AND LOWER(d.city) = LOWER($1)`;
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // --- Prepare Queries ---
        const rideParams = [...params, todayStart];
        const rideStatsQuery = `
            SELECT COUNT(*) as count 
            FROM rides r 
            LEFT JOIN drivers d ON r.driver_id = d.id
            WHERE r.created_at >= $${params.length + 1} ${city ? `AND LOWER(d.city) = LOWER($1)` : ''}
        `;
        const revenueStatsQuery = `
            SELECT SUM(fare) as total 
            FROM rides r 
            LEFT JOIN drivers d ON r.driver_id = d.id
            WHERE r.status = 'completed' AND r.created_at >= $${params.length + 1} ${city ? `AND LOWER(d.city) = LOWER($1)` : ''}
        `;

        const activeDriversQuery = `
            SELECT COUNT(DISTINCT d.id) as count 
            FROM drivers d 
            WHERE d.status = 'active' ${city ? `AND LOWER(d.city) = LOWER($1)` : ''}
        `;
        // const unverifiedDriversQuery = `
        //     SELECT COUNT(DISTINCT d.id) as count 
        //     FROM drivers d 
        //     WHERE d.status = 'pending_verification' ${city ? `AND LOWER(d.city) = LOWER($1)` : ''}
        // `;

        // Ticket queries use 'st' alias
        const ticketParams = city ? [city] : [];
        const openTicketsQuery = `
            SELECT COUNT(*) as count 
            FROM support_tickets st 
            WHERE st.status IN ('open', 'in_progress') AND st.escalation_level = 'none' ${city ? `AND LOWER(st.city) = LOWER($1)` : ''}
        `;
        
        const newTicketsTodayQuery = `
            SELECT COUNT(*) as count 
            FROM support_tickets st 
            WHERE st.created_at >= $${ticketParams.length + 1} ${city ? `AND LOWER(st.city) = LOWER($1)` : ''}
        `;
        
        const solvedTicketsTodayQuery = `
            SELECT COUNT(*) as count 
            FROM support_tickets st 
            WHERE st.status = 'resolved' AND st.resolved_at >= $${ticketParams.length + 1} ${city ? `AND LOWER(st.city) = LOWER($1)` : ''}
        `;

        // --- Execute All Queries in Parallel ---
        console.log("Executing DB queries...");
        const [
            rideStatsResult,
            revenueStatsResult,
            activeDriversResult,
            // unverifiedDriversResult,
            openTicketsResult,
            newTicketsTodayResult,
            solvedTicketsTodayResult
        ] = await Promise.all([
            query(rideStatsQuery, rideParams),
            query(revenueStatsQuery, rideParams),
            query(activeDriversQuery, params),
            // query(unverifiedDriversQuery, params),
            query(openTicketsQuery, ticketParams),
            query(newTicketsTodayQuery, [...ticketParams, todayStart]),
            query(solvedTicketsTodayQuery, [...ticketParams, todayStart])
        ]);
        console.log("DB queries completed.");

        // --- Response ---
        res.json({
            success: true,
            data: {
                totalRidesToday: parseInt(rideStatsResult.rows[0]?.count || 0, 10),
                totalRevenueToday: parseFloat(revenueStatsResult.rows[0]?.total || 0),
                activeDrivers: parseInt(activeDriversResult.rows[0]?.count || 0, 10),
                totalOpenTickets: parseInt(openTicketsResult.rows[0]?.count || 0, 10),
                totalSolvedToday: parseInt(solvedTicketsTodayResult.rows[0]?.count || 0, 10),
                totalNewTicketsToday: parseInt(newTicketsTodayResult.rows[0]?.count || 0, 10),
                // totalUnverifiedDrivers: parseInt(unverifiedDriversResult.rows[0]?.count || 0, 10)
            }
        });
    } catch (err) { 
        console.error('Error fetching overview stats:', err); 
        res.status(500).json({ message: 'Error fetching overview stats.', error: err.message }); 
    }
};

// 2. Ride Volume Graph
const getRideVolume = async (req, res) => {
    const { city, useMockData } = req.query; // Optional city filter
    // --- START MOCK DATA BLOCK ---
    // If the 'useMockData' flag is set to 'true', generate and return fake data.
    if (useMockData === 'true') {
        console.log('[Dashboard] Returning MOCK data for ride volume graph.');
        
        const mockSummary = {
            totalStarted: 16921,
            totalCompleted: 15680,
            totalCancelled: 1241,
            overallAverageFare: 158.40
        };

        const mockHourlyData = [];
        const now = new Date();
        now.setMinutes(0, 0, 0); // Start at the current hour

        // A realistic 24-hour pattern: low at night, morning peak, evening peak
        const ridePatterns = [
            800, 900, 1900, 1800, 1000, 1800, 3000, 4000, 3500, 4000, // Night/Early morning
            4500, 8000, 5000, 5100, 6000, 2800, 6200, 7000, 900, 850, // Morning/Day
            900, 950, 700, 300 // Evening
        ];
        
        // Generate 24 hourly data points, counting backwards
        for (let i = 23; i >= 0; i--) {
            const hourTimestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
            
            const started = Math.floor(ridePatterns[i] * (Math.random() * 0.2 + 0.9)); // Add +/- 10% jitter
            const completed = Math.floor(started * 0.9); // 90% completed
            const cancelled = started - completed;
            const avgFare = Math.floor(Math.random() * 50 + 130); // Random fare between 130-180
            
            mockHourlyData.push({
                hour: hourTimestamp.toISOString(),
                started_count: started,
                completed_count: completed,
                cancelled_count: cancelled,
                average_fare: avgFare
            });
        }

        return res.json({ 
            success: true, 
            data: {
                hourlyData: mockHourlyData,
                summary: mockSummary
            } 
        });
    }
    // --- END MOCK DATA BLOCK ---
    try {
        
        // Build base WHERE clause and params for filtering
        let baseWhereConditions = [`r.created_at >= NOW() - INTERVAL '24 hours'`];
        const baseParams = [];
        if (city) {
            // Use $1 for the city parameter
            baseWhereConditions.push(`LOWER(d.city) = LOWER($1)`);
            baseParams.push(city);
        }
        const baseWhereClause = `WHERE ${baseWhereConditions.join(' AND ')}`;

        // Query 1: Get HOURLY breakdown for the graph
        // This query now generates all 24 hours and LEFT JOINS the ride data
        const hourlyQueryText = `
            -- 1. Create a CTE (Common Table Expression) for all 24 hours
            WITH all_hours AS (
                SELECT generate_series(
                    DATE_TRUNC('hour', NOW() - INTERVAL '23 hours'),
                    DATE_TRUNC('hour', NOW()),
                    '1 hour'
                ) as hour
            ),
            -- 2. Create a CTE for your existing ride data
            ride_data AS (
                SELECT 
                    DATE_TRUNC('hour', r.created_at) as hour,
                    COUNT(r.id) as started_count,
                    COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_count,
                    COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) as cancelled_count,
                    AVG(CASE WHEN r.status = 'completed' THEN r.fare END) as average_fare
                FROM rides r
                LEFT JOIN drivers d ON r.driver_id = d.id
                ${baseWhereClause}
                GROUP BY 1 -- Group by the hour
            )
            -- 3. LEFT JOIN the hour template with your ride data
            SELECT 
                h.hour,
                COALESCE(rd.started_count, 0)::int as started_count,
                COALESCE(rd.completed_count, 0)::int as completed_count,
                COALESCE(rd.cancelled_count, 0)::int as cancelled_count,
                COALESCE(rd.average_fare, 0)::float as average_fare
            FROM all_hours h
            LEFT JOIN ride_data rd ON h.hour = rd.hour
            ORDER BY h.hour;
        `;
        
        // Query 2: Get OVERALL totals (this query remains the same)
        const summaryQueryText = `
             SELECT 
                COUNT(r.id) as total_started,
                COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as total_completed,
                COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) as total_cancelled,
                COALESCE(AVG(CASE WHEN r.status = 'completed' THEN r.fare END), 0) as overall_average_fare
            FROM rides r
            LEFT JOIN drivers d ON r.driver_id = d.id
            ${baseWhereClause};
        `;

        // Run both queries in parallel
        const [hourlyResult, summaryResult] = await Promise.all([
            query(hourlyQueryText, baseParams),
            query(summaryQueryText, baseParams)
        ]);
        
        const summaryData = {
             totalStarted: parseInt(summaryResult.rows[0]?.total_started || 0, 10),
             totalCompleted: parseInt(summaryResult.rows[0]?.total_completed || 0, 10),
             totalCancelled: parseInt(summaryResult.rows[0]?.total_cancelled || 0, 10),
             overallAverageFare: parseFloat(summaryResult.rows[0]?.overall_average_fare || 0)
        };
        
        //-- response --
        res.json({ 
            success: true, 
            data: {
                hourlyData: hourlyResult.rows, // Data for the graph
                summary: summaryData           // Data for the totals below the graph
            } 
        });
        
    } catch (err) { 
        console.error('Error fetching ride volume:', err);
        res.status(500).json({ message: 'Error fetching ride volume.', error: err.message }); 
    }
};

// 3. Active user Summary (Pie Chart)
const getActiveUserSummary = async (req, res) => {
    try {
        const { city } = req.query;

        // --- dynamic WHERE clause ---
        let driverWhereClause = `WHERE d.status = 'active'`;
        const driverParams = [];
        if (city) {
            driverWhereClause += ` AND LOWER(d.city) = LOWER($1)`;
            driverParams.push(city);
        }

        // Query for active drivers
        const driverCountQuery = `
            SELECT COUNT(d.id) as count 
            FROM drivers d 
            ${driverWhereClause}`;

        // Query for active customers (defined as users who have taken at least one ride)
        // Note: This counts customers globally.
        const customerCountQuery = `
            SELECT COUNT(DISTINCT u.id) as count 
            FROM users u
            JOIN rides r ON u.id = r.customer_id`;

        const [driverCountResult, customerCountResult] = await Promise.all([
            query(driverCountQuery, driverParams),
            query(customerCountQuery) 
        ]);

        res.json({
            success: true,
            data: {
                activeDrivers: parseInt(driverCountResult.rows[0]?.count || 0, 10),
                activeCustomers: parseInt(customerCountResult.rows[0]?.count || 0, 10)
            }
        });
    } catch (err) { 
        console.error('Error fetching active user summary:', err);
        res.status(500).json({ message: 'Error fetching user summary.', error: err.message }); 
    }
};

// 4. Driver Payouts Snapshot  (pending not completed)
const getDriverPayouts = async (req, res) => {
    try {
        const { city } = req.query;
        let cityFilter = city ? 'WHERE LOWER(d.city) = LOWER($1)' : '';
        const params = city ? [city] : [];

        const { rows } = await query(`
            SELECT SUM(p.amount) as total_pending 
            FROM driver_payouts p
            LEFT JOIN drivers d ON p.driver_id = d.id
            WHERE p.status = 'pending' ${cityFilter}
        `, params);
        res.json({ success: true, data: { pendingAmount: parseFloat(rows[0].total_pending || 0) } });
    } catch (err) { res.status(500).json({ message: 'Error fetching driver payouts.' }); }
};

// 5. Driver Pending Verifications
const getPendingVerifications = async (req, res) => {
    try {
        const { city } = req.query; // Optional city filter

        // --- Build dynamic WHERE clauses ---
        let baseWhereClause = '';
        const baseParams = [];
        if (city) {
            baseWhereClause = `WHERE LOWER(d.city) = LOWER($1)`;
            baseParams.push(city);
        }

        // --- Query 1: Get TOTAL count of PENDING drivers ---
        // (This query doesn't need to change)
        const pendingCountQuery = `
            SELECT COUNT(d.id) as count 
            FROM drivers d 
            ${baseWhereClause} 
            ${baseWhereClause ? 'AND' : 'WHERE'} d.status = 'pending_verification'
        `;

        // --- Query 2: Get RECENTLY PROCESSED drivers ---
        const recentProcessedLimit = 3;
        const recentProcessedQuery = `
            SELECT 
                d.id as driverId, 
                u.full_name as name, 
                d.city,
                d.status,
                d.updated_at as processedAt -- *** CHANGED ***
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            ${baseWhereClause} 
            ${baseWhereClause ? 'AND' : 'WHERE'} d.status = 'active' -- Fetch 'active' drivers
            ORDER BY d.updated_at DESC -- *** CHANGED to order by the new column ***
            LIMIT ${recentProcessedLimit}
        `;
        
        // --- Execute in parallel ---
        const [pendingCountResult, recentProcessedResult] = await Promise.all([
            query(pendingCountQuery, baseParams),
            query(recentProcessedQuery, baseParams)
        ]);

        // --- Format the response (no change needed here) ---
        const totalPending = parseInt(pendingCountResult.rows[0]?.count || 0, 10);
        const recentlyProcessed = recentProcessedResult.rows.map(row => ({
             driverId: row.driverid,
             name: row.name,
             city: row.city,
             status: row.status,
        }));

        res.json({ 
            success: true, 
            data: {
                totalPending: totalPending,
                recentlyProcessed: recentlyProcessed
            } 
        });

    } catch (err) { 
        console.error('Error fetching pending verifications summary:', err); 
        res.status(500).json({ message: 'Error fetching pending verifications summary.', error: err.message }); 
    }
};

// 6. Support Ticket Snapshot
const getTicketSummary = async (req, res) => {
    try {
        const { city } = req.query;
        let { cityFilter, params } = buildCityFilter(city, 'st');

        const { rows } = await query(`
            SELECT 
                COUNT(CASE WHEN status = 'open' THEN 1 END) as total_open,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as total_pending,
                COUNT(CASE WHEN status = 'resolved' AND resolved_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as resolved_last_24h
            FROM support_tickets st
            ${cityFilter}
        `, params);

        const { rows: highPriority } = await query(`
            SELECT id, subject, priority, created_at, st.city -- Add st.city here
            FROM support_tickets st
            ${cityFilter}
            ${cityFilter ? 'AND' : 'WHERE'} priority IN ('high', 'urgent') AND status IN ('open', 'in_progress')
            ORDER BY created_at DESC
            LIMIT 5
        `, params);

        // --- response ---
        res.json({ success: true, data: { ...rows[0], recentHighPriority: highPriority } });
    } catch (err) { res.status(500).json({ message: 'Error fetching ticket summary.' }); }
};

// 7. Top Performing Cities
const getTopCities = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query; 
        const allowedPeriods = ['daily', 'weekly', 'monthly', 'all_time'];

        const effectivePeriod = allowedPeriods.includes(period) ? period : 'monthly';

        let dateFilter = '';
        const params = []; 
        if (effectivePeriod === 'daily') {
            dateFilter = `AND r.created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`; 
        } else if (effectivePeriod === 'weekly') {
            dateFilter = `AND r.created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')`; 
        } else if (effectivePeriod === 'monthly') {
            dateFilter = `AND r.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')`;
        }
        // If period is 'all_time', dateFilter remains empty

        const queryText = `
            SELECT 
                d.city, 
                COALESCE(SUM(r.fare), 0) as revenue
            FROM rides r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.status = 'completed' 
              ${dateFilter}  -- Add the dynamic date filter here
            GROUP BY d.city
            ORDER BY revenue DESC;
        `;

        const { rows } = await query(queryText, params); // Pass empty params if no date filter

        // --- response ---
        res.json({ 
            success: true, 
            data: {
                period: effectivePeriod,
                cities: rows 
            }
        });

    } catch (err) { 
        console.error('Error fetching top cities:', err);
        res.status(500).json({ message: 'Error fetching top cities.', error: err.message }); 
    }
};

// 8. Broadcast (Pending not completed yet)
const sendBroadcast = async (req, res) => {
    try {
        const { message, target } = req.body;
        // This is a placeholder. A real implementation would query user IDs 
        // and send to a push notification service.
        console.log(`--- BROADCAST SENT ---`);
        console.log(`Target: ${target}`);
        console.log(`Message: ${message}`);
        console.log(`------------------------`);
        res.status(200).json({ success: true, message: 'Broadcast sent.' });
    } catch (err) { res.status(500).json({ message: 'Error sending broadcast.' }); }
};

// 9. Escalated Tickets
const getEscalatedTickets = async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                st.id, 
                st.subject, 
                st.escalation_level, 
                st.city, 
                st.created_at -- Select created_at instead of updated_at
            FROM support_tickets st
            WHERE st.escalation_level = 'central_admin' 
              AND st.status NOT IN ('resolved', 'closed')
            ORDER BY st.created_at DESC -- Order by creation time instead
            LIMIT 4
        `);
        res.json({ success: true, data: rows });
    } catch (err) { 
        console.error('Error fetching escalated tickets:', err); 
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching escalated tickets.', 
            error: err.message 
        }); 
    }
};

module.exports = {
    getOverviewStats,
    getRideVolume,
    getActiveUserSummary,
    getDriverPayouts,
    getPendingVerifications,
    getTicketSummary,
    getTopCities,
    sendBroadcast,
    getEscalatedTickets
};