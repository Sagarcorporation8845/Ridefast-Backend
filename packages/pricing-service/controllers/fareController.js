// packages/pricing-service/controllers/fareController.js
const fareService = require('../services/fareService.js'); // Explicitly added .js extension

const calculateFare = async (req, res) => {
    const { pickup, dropoff } = req.body;
    const userId = req.user.userId;

    if (!pickup || !pickup.latitude || !pickup.longitude || !dropoff || !dropoff.latitude || !dropoff.longitude) {
        return res.status(400).json({ message: 'Pickup and dropoff coordinates are required.' });
    }

    try {
        const fareEstimates = await fareService.getFareEstimates(pickup, dropoff, userId);
        
        if (!fareEstimates || fareEstimates.length === 0) {
            return res.status(404).json({ message: 'Could not calculate fares. The route may be outside our service area.' });
        }

        res.status(200).json({ options: fareEstimates });

    } catch (error) {
        console.error('Fare calculation controller error:', error);
        res.status(500).json({ message: 'An error occurred while calculating the fare.' });
    }
};

module.exports = {
    calculateFare,
};