const cron = require('node-cron');
const { query } = require('../db'); // Use the high-level query function

/**
 * This is the main function that starts the scheduled jobs.
 * It's called once from index.js when the server starts.
 */
function startScheduler() {
    console.log('[Scheduler] Cron job scheduled for 00:00 daily.');
    
    // This runs a job every day at 00:00 (midnight)
    cron.schedule('0 0 * * *', async () => {
        console.log(`[Scheduler] It's midnight! Applying scheduled changes...`);
        // Run both tasks in sequence
        await applyScheduledRates();
        await applyScheduledSubscriptions();
    });
}

/**
 * Finds and applies all pending vehicle rate changes.
 */
async function applyScheduledRates() {
    console.log('[Scheduler] Checking for scheduled vehicle rates...');
    try {
        await query('BEGIN');
        
        const { rows } = await query(`
            SELECT id, scheduled_rate_change FROM vehicle_rates
            WHERE scheduled_effective_time IS NOT NULL AND scheduled_effective_time <= NOW()
            FOR UPDATE
        `);

        if (rows.length === 0) {
            await query('ROLLBACK');
            console.log('[Scheduler] No scheduled vehicle rates to apply.');
            return;
        }

        console.log(`[Scheduler] Found ${rows.length} vehicle rate changes to apply...`);
        for (const row of rows) {
            const rates = row.scheduled_rate_change;
            // Ensure all required fields are present
            if (rates && rates.base_fare != null && rates.per_km_rate != null && rates.per_min_rate != null) {
                await query(`
                    UPDATE vehicle_rates
                    SET 
                        base_fare = $1,
                        per_km_rate = $2,
                        per_min_rate = $3,
                        is_active = $4,
                        scheduled_rate_change = NULL,
                        scheduled_effective_time = NULL
                    WHERE id = $5
                `, [rates.base_fare, rates.per_km_rate, rates.per_min_rate, rates.is_active, row.id]);
            }
        }
        await query('COMMIT');
        console.log('[Scheduler] Vehicle rates applied successfully.');

    } catch (e) {
        await query('ROLLBACK');
        console.error('Scheduler error applying vehicle rates:', e);
    }
}

/**
 * Finds and applies all pending subscription fee changes.
 */
async function applyScheduledSubscriptions() {
    console.log('[Scheduler] Checking for scheduled subscription fees...');
    try {
        await query('BEGIN');
        
        // Find all rows that have a scheduled change due
        const { rows } = await query(`
            SELECT * FROM subscription_rates
            WHERE scheduled_effective_time IS NOT NULL AND scheduled_effective_time <= NOW()
            FOR UPDATE
        `);

        if (rows.length === 0) {
            await query('ROLLBACK');
            console.log('[Scheduler] No scheduled subscription fees to apply.');
            return;
        }
        
        console.log(`[Scheduler] Found ${rows.length} subscription fee changes to apply...`);
        for (const row of rows) {
            // Use COALESCE: This clever function takes the scheduled fee if it's not NULL,
            // otherwise it just keeps the current fee. This allows partial updates.
            await query(`
                UPDATE subscription_rates
                SET 
                    current_daily_fee = COALESCE($1, current_daily_fee),
                    current_weekly_fee = COALESCE($2, current_weekly_fee),
                    current_monthly_fee = COALESCE($3, current_monthly_fee),
                    
                    scheduled_daily_fee = NULL,
                    scheduled_weekly_fee = NULL,
                    scheduled_monthly_fee = NULL,
                    scheduled_effective_time = NULL
                WHERE city_name = $4
            `, 
            [
                row.scheduled_daily_fee,
                row.scheduled_weekly_fee,
                row.scheduled_monthly_fee,
                row.city_name
            ]);
            console.log(`[Scheduler] Applied new fees for city ${row.city_name}.`);
        }
        await query('COMMIT');
        console.log('[Scheduler] Subscription fees applied successfully.');

    } catch (e) {
        await query('ROLLBACK');
        console.error('Scheduler error applying subscription fees:', e);
    }
}

module.exports = {
    startScheduler
};