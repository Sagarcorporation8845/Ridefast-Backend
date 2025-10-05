// packages/pricing-service/controllers/fareController.js
const fareService = require('../services/fareService.js');

const calculateFare = async (req, res) => {
    const { pickup, dropoff } = req.body;
    const userId = req.user.userId;

    if (!pickup || !pickup.latitude || !pickup.longitude || !dropoff || !dropoff.latitude || !dropoff.longitude) {
        return res.status(400).json({ message: 'Pickup and dropoff coordinates are required.' });
    }

    try {
        const fareData = await fareService.getFareEstimates(pickup, dropoff, userId);
        
        // If no options are available (e.g., outside service area), send a 404 but include payment info.
        if (!fareData || !fareData.options || fareData.options.length === 0) {
            return res.status(404).json({ 
                message: 'Could not calculate fares. The route may be outside our service area.',
                payment_options: fareData.payment_options 
            });
        }

        res.status(200).json(fareData); // Send the entire object with both options and payment_options

    } catch (error) {
        console.error('Fare calculation controller error:', error);
        res.status(500).json({ message: 'An error occurred while calculating the fare.' });
    }
};

module.exports = {
    calculateFare,
};