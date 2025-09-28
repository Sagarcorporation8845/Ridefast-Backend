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
        
        if (drivers.length >= minDrivers || radius >= maxRadius) {
            break;
        }

        radius *= 2;
    }

    return drivers;
};

/**
 * @desc Finds nearby online drivers. It automatically determines the city from the 
 * provided coordinates before finding and categorizing vehicles.
 */
const findNearbyDrivers = async (req, res) => {
  // --- FIX: 'city' is no longer required from the client ---
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ message: 'latitude and longitude are required.' });
  }

  try {
    // 1. Get all active city names from the database to know where we can search
    const citiesResult = await db.query("SELECT city_name FROM servicable_cities WHERE status = 'active'");
    if (citiesResult.rows.length === 0) {
      return res.status(404).json({ message: "No serviceable cities are active in the system." });
    }
    const activeCities = citiesResult.rows.map(row => row.city_name);

    // 2. Determine which city the user is in by checking Redis
    let cityOfSearch = null;
    for (const city of activeCities) {
      const geoKey = `online_drivers:${city}`;
      // Check for just ONE driver within a large radius (e.g., 50km) to quickly identify the correct city
      const result = await redisClient.geoSearch(geoKey, 
        { longitude: parseFloat(longitude), latitude: parseFloat(latitude) }, 
        { radius: 50, unit: 'km' }, 
        { COUNT: 1 }
      );
      if (result.length > 0) {
        cityOfSearch = city;
        break; // Found the city, no need to check others
      }
    }

    if (!cityOfSearch) {
      return res.status(200).json({ message: 'It seems you are outside our service area. No drivers found.', vehicles: {} });
    }

    // 3. Now that we have the correct city, find a good number of drivers with the dynamic radius logic
    const finalGeoKey = `online_drivers:${cityOfSearch}`;
    const nearbyDriverIds = await findDriversWithDynamicRadius(finalGeoKey, parseFloat(longitude), parseFloat(latitude));

    if (nearbyDriverIds.length === 0) {
      return res.status(200).json({ message: 'No drivers found nearby.', vehicles: {} });
    }

    // 4. Fetch vehicle details for the found drivers from PostgreSQL
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
    
    // 5. Categorize vehicles and format the response
    const categorizedVehicles = {};

    for (const driverId of nearbyDriverIds) {
      const vehicle = vehicleDetails.find(v => v.driver_id === driverId);
      if (!vehicle) continue;

      const driverLocation = await redisClient.geoPos(finalGeoKey, driverId);
      if (!driverLocation || !driverLocation[0]) continue;

      const locationData = {
          latitude: parseFloat(driverLocation[0].latitude),
          longitude: parseFloat(driverLocation[0].longitude)
      };

      const mainCategory = vehicle.category;
      const subCategory = vehicle.sub_category;

      if (!categorizedVehicles[mainCategory]) {
          categorizedVehicles[mainCategory] = subCategory ? {} : [];
      }
      
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