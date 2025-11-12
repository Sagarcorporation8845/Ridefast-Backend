const { query } = require('../db');

// --- VEHICLE FARE RATES ---
const getFareRates = async (req, res) => {
    // Get the optional city filter from the query parameters
    const { city } = req.query; 

    try {
        let queryText = "SELECT * FROM vehicle_rates";
        const params = [];

        // If 'city' is provided and is not 'all', add a WHERE clause
        if (city && city.toLowerCase() !== 'all') {
            params.push(city);
            // Use LOWER() on both sides for a case-insensitive match
            queryText += ` WHERE LOWER(city_name) = LOWER($1)`;
        }
        
        queryText += " ORDER BY city_name, vehicle_category";
        
        const { rows } = await query(queryText, params);
        res.json({ success: true, data: rows });

    } catch (err) {
        console.error('Error fetching fare rates:', err);
        res.status(500).json({ message: 'Error fetching fare rates', error: err.message });
    }
};
const updateFareRate = async (req, res) => {
    const { id } = req.params;
    const { base_fare, per_km_rate, per_min_rate, is_active, applyAt } = req.body;
    
    if (!applyAt || !['now', 'midnight'].includes(applyAt)) {
        return res.status(400).json({ message: "Invalid 'applyAt' value. Must be 'now' or 'midnight'."});
    }

    try {
        let queryText;
        let params;

        if (applyAt === 'now') {
            queryText = `UPDATE vehicle_rates SET 
                            base_fare = $1, per_km_rate = $2, per_min_rate = $3, is_active = $4,
                            scheduled_rate_change = NULL, scheduled_effective_time = NULL
                         WHERE id = $5 RETURNING *`;
            params = [base_fare, per_km_rate, per_min_rate, is_active, id];
        } else {
            // Schedule for midnight
            const now = new Date();
            const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0); // Next 00:00
            
            const scheduled_rate_change = { base_fare, per_km_rate, per_min_rate, is_active };
            
            queryText = `UPDATE vehicle_rates SET 
                            scheduled_rate_change = $1,
                            scheduled_effective_time = $2
                         WHERE id = $3 RETURNING *`;
            params = [JSON.stringify(scheduled_rate_change), nextMidnight.toISOString(), id];
        }

        const { rows } = await query(queryText, params);
        if (rows.length === 0) return res.status(404).json({ message: 'Rate ID not found.' });
        
        res.json({ success: true, message: `Rate update processing via '${applyAt}'`, data: rows[0] });

    } catch (err) {
        console.error('Error updating fare rate:', err);
        res.status(500).json({ message: 'Error updating fare rate', error: err.message });
    }
};

// --- DRIVER SUBSCRIPTION FEES ---
const getSubscriptionFees = async (req, res) => {
    const { city } = req.query; // City is now an optional filter

    try {
        let queryText = "SELECT * FROM subscription_rates";
        const params = [];

        // If 'city' is provided and is not 'all', filter by it
        if (city && city.toLowerCase() !== 'all') {
            queryText += " WHERE LOWER(city_name) = LOWER($1)";
            params.push(city);
        }
        
        queryText += " ORDER BY city_name";
        
        const { rows } = await query(queryText, params);
        res.json({ success: true, data: rows });

    } catch (err) {
        console.error('Error fetching subscription fees:', err);
        res.status(500).json({ message: 'Error fetching subscription fees', error: err.message });
    }
};

const updateSubscriptionFee = async (req, res) => {
    const { city_name } = req.params;
    const { applyAt, fees } = req.body; // e.g., fees: { "daily_fee": 25, "weekly_fee": 150 }

    if (!applyAt || !['now', 'midnight'].includes(applyAt)) {
        return res.status(400).json({ message: "Invalid 'applyAt' value. Must be 'now' or 'midnight'."});
    }
    if (!fees || Object.keys(fees).length === 0) {
        return res.status(400).json({ message: "A 'fees' object with at least one fee type is required."});
    }

    try {
        let queryText = "UPDATE subscription_rates SET ";
        const params = [];
        let paramIndex = 1;

        if (applyAt === 'now') {
            // Apply immediately and clear any scheduled changes
            if (fees.daily_fee)   { params.push(fees.daily_fee);   queryText += `current_daily_fee = $${paramIndex++}, `; }
            if (fees.weekly_fee)  { params.push(fees.weekly_fee);  queryText += `current_weekly_fee = $${paramIndex++}, `; }
            if (fees.monthly_fee) { params.push(fees.monthly_fee); queryText += `current_monthly_fee = $${paramIndex++}, `; }

            queryText += `scheduled_daily_fee = NULL, scheduled_weekly_fee = NULL, 
                          scheduled_monthly_fee = NULL, scheduled_effective_time = NULL `;
        
        } else {
            // Schedule for midnight
            const now = new Date();
            const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
            
            if (fees.daily_fee)   { params.push(fees.daily_fee);   queryText += `scheduled_daily_fee = $${paramIndex++}, `; }
            if (fees.weekly_fee)  { params.push(fees.weekly_fee);  queryText += `scheduled_weekly_fee = $${paramIndex++}, `; }
            if (fees.monthly_fee) { params.push(fees.monthly_fee); queryText += `scheduled_monthly_fee = $${paramIndex++}, `; }

            params.push(nextMidnight.toISOString());
            queryText += `scheduled_effective_time = $${paramIndex++} `;
        }

        params.push(city_name);
        queryText += `WHERE LOWER(city_name) = LOWER($${paramIndex}) RETURNING *`;

        const { rows } = await query(queryText, params);
        if (rows.length === 0) return res.status(404).json({ message: `City '${city_name}' not found.` });
        
        res.json({ success: true, message: `Subscription fee update for ${city_name} processing via '${applyAt}'`, data: rows[0] });

    } catch (err) {
        console.error('Error updating subscription fee:', err);
        res.status(500).json({ message: 'Error updating subscription fee', error: err.message });
    }
};

module.exports = {
    getFareRates,
    updateFareRate,
    getSubscriptionFees,
    updateSubscriptionFee
};