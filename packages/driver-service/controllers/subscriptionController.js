// packages/driver-service/controllers/subscriptionController.js
const { query } = require('../db'); // Use the high-level query function

/**
 * Gets the driver's current subscription status and the price of a new pass.
 */
const getSubscriptionInfo = async (req, res) => {
    // We get driverId and city from the authentication middleware
    const { driverId, city } = req.driverInfo; 

    try {
        // Run queries in parallel to get subscription and rate info
        const subPromise = query(
            `SELECT is_active, active_until FROM driver_subscriptions WHERE driver_id = $1`,
            [driverId]
        );
        
        const ratePromise = query(
            `SELECT current_daily_fee FROM subscription_rates WHERE LOWER(city_name) = LOWER($1)`,
            [city]
        );

        const [subResult, rateResult] = await Promise.all([subPromise, ratePromise]);

        const subscription = subResult.rows[0];
        const rate = rateResult.rows[0];

        if (!rate) {
            return res.status(404).json({ message: "Subscription rates not found for your city." });
        }

        res.json({
            success: true,
            data: {
                current_daily_fee: parseFloat(rate.current_daily_fee),
                is_active: subscription ? subscription.is_active : false,
                active_until: subscription ? subscription.active_until : null
            }
        });

    } catch (err) {
        console.error('Error getting subscription info:', err);
        res.status(500).json({ message: "Error fetching subscription info." });
    }
};

/**
 * The driver pays for a new 24-hour subscription pass using their wallet.
 */
const payForSubscription = async (req, res) => {
    // Get all driver info from the auth middleware
    const { driverId, city, userId } = req.driverInfo; 

    try {
        // Start transaction using high-level query
        await query('BEGIN'); 

        // 1. Get the price of the subscription for the driver's city
        const rateResult = await query(
            `SELECT current_daily_fee FROM subscription_rates WHERE LOWER(city_name) = LOWER($1)`,
            [city]
        );
        if (rateResult.rows.length === 0) {
            throw new Error('Subscription rate not found for city.');
        }
        const feeToPay = parseFloat(rateResult.rows[0].current_daily_fee);

        // 2. Get the driver's wallet (linked by user_id) and lock the row
        const walletResult = await query(
            `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
            [userId] 
        );
        if (walletResult.rows.length === 0) {
            throw new Error('Driver wallet not found.');
        }
        const wallet = walletResult.rows[0];
        const walletBalance = parseFloat(wallet.balance);

        // 3. Check if they have enough money
        if (walletBalance < feeToPay) {
            await query('ROLLBACK'); // Rollback before returning
            return res.status(402).json({ // 402 = Payment Required
                message: "Insufficient wallet balance. Please top up your wallet to pay for the subscription.",
                code: "INSUFFICIENT_FUNDS"
            });
        }

        // 4. Deduct the fee from their wallet
        const newBalance = walletBalance - feeToPay;
        await query(`UPDATE wallets SET balance = $1 WHERE id = $2`, [newBalance, wallet.id]);

        // 5. Log this transaction
        await query(
            `INSERT INTO transactions (wallet_id, amount, type, status)
             VALUES ($1, $2, 'subscription_payment', 'successful')`,
            [wallet.id, -feeToPay] // Store as a negative amount
        );

        // 6. Activate their subscription for 24 hours (UPSERT)
        await query(
            `INSERT INTO driver_subscriptions (driver_id, is_active, active_until, last_paid_at, last_paid_amount)
             VALUES ($1, true, NOW() + INTERVAL '1 day', NOW(), $2)
             ON CONFLICT (driver_id) DO UPDATE 
               SET is_active = true, 
                   active_until = NOW() + INTERVAL '1 day',
                   last_paid_at = NOW(),
                   last_paid_amount = $2`,
            [driverId, feeToPay]
        );

        // 7. Commit all changes
        await query('COMMIT');

        res.status(200).json({
            success: true,
            message: "Subscription successful! You are now active for 24 hours.",
            data: {
                is_active: true,
                active_until: new Date(new Date().getTime() + 24 * 60 * 60 * 1000) // Send back the new expiry
            }
        });

    } catch (err) {
        // If any query fails, roll back
        try {
            await query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Failed to rollback transaction:', rollbackError);
        }
        console.error('Error paying for subscription:', err);
        res.status(500).json({ message: 'Error processing subscription payment.', error: err.message });
    }
    // No 'finally' block is needed, as the high-level 'query' function handles connection release.
};

module.exports = {
    getSubscriptionInfo,
    payForSubscription
};