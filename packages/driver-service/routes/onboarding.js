// packages/driver-service/routes/onboarding.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// --- Personal Details Endpoint (No changes needed here) ---
router.post('/personal-details', tokenVerify, async (req, res) => {
    const { fullName, city } = req.body;
    const userId = req.user.userId;

    if (!fullName || !city) {
        return res.status(400).json({ message: 'Full name and city are required.' });
    }

    try {
        await db.query('UPDATE users SET full_name = $1 WHERE id = $2', [fullName, userId]);
        const { rows } = await db.query(
            'INSERT INTO drivers (user_id, city) VALUES ($1, $2) RETURNING id',
            [userId, city]
        );
        
        const driverId = rows[0].id;
        res.status(201).json({ 
            message: 'Personal details saved. Proceed to vehicle details.',
            driverId: driverId 
        });

    } catch (err) {
        if (err.code === '23505') { 
            const { rows } = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
            if (rows.length > 0) {
                 return res.status(200).json({ 
                    message: 'Existing driver profile found. Proceed to vehicle details.',
                    driverId: rows[0].id
                });
            }
            return res.status(409).json({ message: 'Driver profile already exists for this user, but could not retrieve ID.' });
        }
        console.error('Error saving personal details:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// --- SECURED Vehicle Details Endpoint ---
router.post('/vehicle-details', tokenVerify, async (req, res) => {
    // **THE FIX**: We no longer take driverId from the body.
    const { vehicleType, registrationNumber, modelName, fuelType } = req.body;
    const userId = req.user.userId; // We use the secure userId from the token.

    const allowedVehicleTypes = ['bike', 'auto', 'car', 'commercial'];
    const allowedFuelTypes = ['electric', 'petrol', 'diesel', 'hybrid'];

    if (!vehicleType || !registrationNumber || !modelName || !fuelType) {
        return res.status(400).json({ message: 'All vehicle fields are required.' });
    }
    if (!allowedVehicleTypes.includes(vehicleType.toLowerCase())) {
        return res.status(400).json({ message: `Invalid vehicle type.` });
    }
    if (!allowedFuelTypes.includes(fuelType.toLowerCase())) {
        return res.status(400).json({ message: `Invalid fuel type.` });
    }
    
    try {
        // **THE FIX**: First, get the driverId from the database using the secure userId.
        const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
        if (driverResult.rows.length === 0) {
            return res.status(403).json({ message: 'No driver profile found for this user. Cannot add vehicle.' });
        }
        const driverId = driverResult.rows[0].id;

        // Now, proceed with the original logic using the secure driverId.
        await db.query(
            'INSERT INTO driver_vehicles (driver_id, category, registration_number, model_name, fuel_type) VALUES ($1, $2, $3, $4, $5)',
            [driverId, vehicleType.toLowerCase(), registrationNumber, modelName, fuelType.toLowerCase()]
        );
        res.status(201).json({ message: 'Vehicle details saved. Proceed to document upload.' });
    } catch (err) {
        if (err.code === '23505') { 
             return res.status(409).json({ message: 'A vehicle with this registration number or for this driver already exists.' });
        }
        console.error('Error saving vehicle details:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// --- Multer Configuration for Document Uploads ---
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        // **THE FIX**: We look up the driverId using the secure userId from the token.
        const userId = req.user.userId; 
        try {
            const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
            if (driverResult.rows.length === 0) {
                 return cb(new Error('No driver profile found for this user.'), null);
            }
            const driverId = driverResult.rows[0].id;
            const dir = path.join(__dirname, '..', 'uploads', driverId);
            
            // Attach driverId to request object to use later
            req.driverId = driverId;

            fs.mkdir(dir, { recursive: true }, err => {
                if (err) return cb(err, null);
                cb(null, dir);
            });
        } catch (dbError) {
             return cb(dbError, null);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- SECURED Document Upload Endpoint ---
router.post('/upload-document', tokenVerify, upload.single('document'), async (req, res) => {
    // **THE FIX**: We no longer take driverId from the body. It's attached to `req` by Multer.
    const { documentType } = req.body;
    const driverId = req.driverId; // Use the driverId found by Multer's storage function.
    
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    if (!documentType) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'documentType is required.' });
    }

    const fileUrl = `/uploads/${driverId}/${req.file.filename}`;

    try {
        await db.query(
            'INSERT INTO driver_documents (driver_id, document_type, file_url, status) VALUES ($1, $2, $3, $4)',
            [driverId, documentType.toLowerCase(), fileUrl, 'pending']
        );
        
        res.status(201).json({ 
            message: `${documentType} uploaded successfully.`
        });

    } catch (err) {
        fs.unlinkSync(req.file.path); 
        console.error('Error saving document:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// --- Verification Status Endpoint (No changes needed here) ---
router.get('/status', tokenVerify, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rows } = await db.query(
            'SELECT is_verified FROM drivers WHERE user_id = $1',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Driver profile not found.' });
        }

        res.status(200).json({
            isVerified: rows[0].is_verified
        });
    } catch (err) {
        console.error('Error fetching driver status:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;