// packages/ride-service/handlers/customerHandlers.js
const db = require('../db');
const { redisClient } = require('../services/redisClient');
const jwt = require('jsonwebtoken');
const { manageRideRequest } = require('../services/rideManager');
const axios = require('axios');

/**
 * Searches for drivers in Redis with a dynamically expanding radius.
 */
const findDriversWithDynamicRadius = async (geoKey, longitude, latitude) => {
    let radius = 0.5;
    const maxRadius = 10;
    const minDrivers = 5;
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
 * @desc Finds nearby online drivers.
 */
const findNearbyDrivers = async (req, res) => {
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ message: 'latitude and longitude are required.' });
  }

  try {
    const citiesResult = await db.query("SELECT city_name FROM servicable_cities WHERE status = 'active'");
    if (citiesResult.rows.length === 0) {
      return res.status(404).json({ message: "No serviceable cities are active in the system." });
    }
    const activeCities = citiesResult.rows.map(row => row.city_name);

    let cityOfSearch = null;
    for (const city of activeCities) {
      const geoKey = `online_drivers:${city}`;
      const result = await redisClient.geoSearch(geoKey, 
        { longitude: parseFloat(longitude), latitude: parseFloat(latitude) }, 
        { radius: 50, unit: 'km' }, 
        { COUNT: 1 }
      );
      if (result.length > 0) {
        cityOfSearch = city;
        break;
      }
    }

    if (!cityOfSearch) {
      return res.status(200).json({ message: 'It seems you are outside our service area. No drivers found.', vehicles: {} });
    }

    const finalGeoKey = `online_drivers:${cityOfSearch}`;
    const nearbyDriverIds = await findDriversWithDynamicRadius(finalGeoKey, parseFloat(longitude), parseFloat(latitude));

    if (nearbyDriverIds.length === 0) {
      return res.status(200).json({ message: 'No drivers found nearby.', vehicles: {} });
    }

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
    
    const categorizedVehicles = {};

    for (const driverId of nearbyDriverIds) {
      const vehicle = vehicleDetails.find(v => v.driver_id === driverId);
      if (!vehicle) continue;

      const driverLocation = await redisClient.geoPos(finalGeoKey, driverId);
      if (!driverLocation || !driverLocation[0]) continue;

      const locationData = {
          driverId: driverId,
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


/**
 * @desc Handles a customer's request to book a ride.
 */
const requestRide = async (req, res) => {
    const { fareId, payment_method, polyline, use_wallet = false } = req.body;
    const { userId } = req.user;

    if (!fareId || !payment_method || !polyline) {
        return res.status(400).json({ message: 'fareId, payment_method, and polyline are required.' });
    }

    const client = await db.getClient();
    try {
        const decodedFare = jwt.verify(fareId, process.env.JWT_SECRET);

        decodedFare.polyline = polyline;

        if (decodedFare.userId !== userId) {
            return res.status(403).json({ message: 'Fare ID does not belong to this user.' });
        }
        
        if (!decodedFare.pickup || !decodedFare.dropoff) {
            return res.status(400).json({ message: 'Invalid fareId. Missing location data.' });
        }

        const totalFare = parseFloat(decodedFare.fare);
        let walletDeduction = 0;
        let amountDue = totalFare;

        await client.query('BEGIN');

        if (use_wallet) {
            const walletResult = await client.query(
                `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
                [userId]
            );
            const wallet = walletResult.rows[0];

            if (!wallet) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'User wallet not found.' });
            }

            const walletBalance = parseFloat(wallet.balance);

            if (payment_method === 'wallet') {
                if (walletBalance < totalFare) {
                    await client.query('ROLLBACK');
                    return res.status(402).json({ message: 'Insufficient wallet balance to cover the full fare.' });
                }
                walletDeduction = totalFare;
                amountDue = 0;
            } else {
                if (payment_method === 'cash') {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'Wallet balance cannot be partially used for cash payments.' });
                }
                walletDeduction = Math.min(totalFare, walletBalance);
                amountDue = totalFare - walletDeduction;
            }
        }
        
        let pickupAddress = 'Unknown Pickup Location';
        let destinationAddress = 'Unknown Destination';
        try {
            const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
            const pickupPromise = axios.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${decodedFare.pickup.lat},${decodedFare.pickup.lng}&key=${GOOGLE_API_KEY}`);
            const dropoffPromise = axios.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${decodedFare.dropoff.lat},${decodedFare.dropoff.lng}&key=${GOOGLE_API_KEY}`);
            
            const [pickupResponse, dropoffResponse] = await Promise.all([pickupPromise, dropoffPromise]);

            if (pickupResponse.data && pickupResponse.data.results && pickupResponse.data.results[0]) {
                pickupAddress = pickupResponse.data.results[0].formatted_address;
            }
            if (dropoffResponse.data && dropoffResponse.data.results && dropoffResponse.data.results[0]) {
                destinationAddress = dropoffResponse.data.results[0].formatted_address;
            }
        } catch (geoError) {
            console.error('[RideRequest] Could not fetch addresses directly from Google:', geoError.message);
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        const { pickup, dropoff } = decodedFare;
        const rideResult = await client.query(
            `INSERT INTO rides (customer_id, pickup_address, destination_address, pickup_latitude, pickup_longitude, destination_latitude, destination_longitude, status, fare, payment_method, wallet_deduction, amount_due, otp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, $9, $10, $11, $12)
             RETURNING id`,
            [userId, pickupAddress, destinationAddress, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, totalFare, payment_method, walletDeduction, amountDue, otp]
        );

        const rideId = rideResult.rows[0].id;
        
        await client.query('COMMIT');

        manageRideRequest(rideId, decodedFare);

        res.status(201).json({
            message: 'Ride requested successfully. Searching for a driver.',
            rideId: rideId,
            paymentDetails: {
                totalFare,
                walletDeduction,
                amountDue
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        if (error.name === 'TokenExpiredError') {
            console.error('Error requesting ride: JWT token has expired.');
            return res.status(400).json({ message: 'Your fare quote has expired. Please get a new fare and try again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            console.error('Error requesting ride: Invalid JWT token.');
            return res.status(400).json({ message: 'The provided fare ID is invalid.' });
        }

        console.error('Error requesting ride:', error);
        res.status(500).json({ message: 'Internal server error.' });
    } finally {
        client.release();
    }
};

module.exports = {
  findNearbyDrivers,
  requestRide,
};