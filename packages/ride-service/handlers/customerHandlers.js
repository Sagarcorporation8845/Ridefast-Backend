// packages/ride-service/handlers/customerHandlers.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');

/**
 * Searches for drivers in Redis with a dynamically expanding radius.
 * It starts small and widens the search until a minimum number of drivers are found
 * or a maximum radius is reached.
 * @param {string} geoKey - The Redis key for the city's geospatial index.
 * @param {number} longitude - The customer's longitude.
 * @param {number} latitude - The customer's latitude.
 * @returns {Promise<string[]>} A promise that resolves to an array of driver IDs.
 */
const findDriversWithDynamicRadius = async (geoKey, longitude, latitude) => {
    let radius = 0.5; // Start with a 500m radius
    const maxRadius = 10; // Max search radius of 10km
    const minDrivers = 5; // The minimum number of drivers we want to find
    let drivers = [];

    while (radius <= maxRadius) {
        drivers = await redisClient.geoSearch(geoKey, { longitude, latitude }, { radius, unit: 'km' });
        
        // If we find enough drivers or have hit the max radius, stop searching
        if (drivers.length >= minDrivers || radius >= maxRadius) {
            break;
        }

        // Otherwise, double the radius for the next search attempt
        radius *= 2;
    }

    return drivers;
};

/**
 * @desc Finds nearby online drivers and categorizes them by vehicle type
 * and sub-category for the customer app.
 */
const findNearbyDrivers = async (req, res) => {
  const { latitude, longitude, city } = req.query;

  if (!latitude || !longitude || !city) {
    return res.status(400).json({ message: 'latitude, longitude, and city are required.' });
  }

  try {
    const geoKey = `online_drivers:${city.trim()}`;

    // 1. Find driver IDs using the dynamic radius logic
    const nearbyDriverIds = await findDriversWithDynamicRadius(geoKey, parseFloat(longitude), parseFloat(latitude));

    if (nearbyDriverIds.length === 0) {
      return res.status(200).json({ message: 'No drivers found nearby.', vehicles: {} });
    }

    // 2. Fetch vehicle details for the found drivers from PostgreSQL
    const query = `
      SELECT
        d.id as driver_id,
        dv.category,
        dv.sub_category
      FROM drivers d
      JOIN driver_vehicles dv ON d.id = dv.driver_id
      WHERE d.id = ANY($1::uuid[])
    `;
    const { rows: vehicleDetails } = await db.query(query, [nearbyDriverIds]);
    
    // 3. Categorize vehicles and format the response
    const categorizedVehicles = {};

    for (const driverId of nearbyDriverIds) {
      const vehicle = vehicleDetails.find(v => v.driver_id === driverId);
      if (!vehicle) continue;

      const driverLocation = await redisClient.geoPos(geoKey, driverId);
      // Ensure the driver location exists before proceeding
      if (!driverLocation || !driverLocation[0]) continue;

      const locationData = {
          latitude: parseFloat(driverLocation[0].latitude),
          longitude: parseFloat(driverLocation[0].longitude)
      };

      const mainCategory = vehicle.category;
      const subCategory = vehicle.sub_category; // e.g., 'economy', 'premium', 'XL'

      // Initialize main category if it doesn't exist
      if (!categorizedVehicles[mainCategory]) {
          categorizedVehicles[mainCategory] = subCategory ? {} : [];
      }
      
      // Place the location data in the correct category/sub-category
      if (mainCategory === 'car' && subCategory) {
          if (!categorizedVehicles.car[subCategory]) {
              categorizedVehicles.car[subCategory] = [];
          }
          categorizedVehicles.car[subCategory].push(locationData);
      } else if (Array.isArray(categorizedVehicles[mainCategory])) {
          categorizedVehicles[mainCategory].push(locationData);
      }
    }

    res.status(200).json({
      message: 'Nearby vehicles retrieved.',
      vehicles: categorizedVehicles
    });

  } catch (error) {
    console.error('Error finding nearby drivers:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = {
  findNearbyDrivers,
};