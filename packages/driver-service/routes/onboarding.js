// packages/driver-service/routes/onboarding.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// --- Personal Details Endpoint (No changes) ---
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


// --- SECURED Vehicle Details Endpoint (No changes) ---
router.post('/vehicle-details', tokenVerify, async (req, res) => {
    const { vehicleType, registrationNumber, modelName, fuelType } = req.body;
    const userId = req.user.userId; 

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
        const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
        if (driverResult.rows.length === 0) {
            return res.status(403).json({ message: 'No driver profile found for this user. Cannot add vehicle.' });
        }
        const driverId = driverResult.rows[0].id;

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


// --- Multer Configuration for Document Uploads (No changes) ---
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
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


// --- UPDATED SECURED Document Upload Endpoint ---
router.post('/upload-document', tokenVerify, upload.single('document'), async (req, res) => {
    const { documentType } = req.body;
    const driverId = req.driverId; 
    
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    if (!documentType) {
        fs.unlinkSync(req.file.path); // Clean up the uploaded file
        return res.status(400).json({ message: 'documentType is required.' });
    }

    const fileUrl = `/uploads/${driverId}/${req.file.filename}`;

    try {
        // Step 1: Check if a document of this type already exists for the driver
        const existingDoc = await db.query(
            'SELECT id, file_url FROM driver_documents WHERE driver_id = $1 AND document_type = $2',
            [driverId, documentType.toLowerCase()]
        );

        if (existingDoc.rows.length > 0) {
            // Step 2: UPDATE if it exists (it's a re-upload)
            const oldFileUrl = existingDoc.rows[0].file_url;

            await db.query(
                `UPDATE driver_documents 
                 SET file_url = $1, status = 'pending', rejection_reason = NULL, uploaded_at = NOW()
                 WHERE id = $2`,
                [fileUrl, existingDoc.rows[0].id]
            );

            // Optional: Delete the old file from storage to save space
            if (oldFileUrl) {
                const oldFilePath = path.join(__dirname, '..', oldFileUrl);
                fs.unlink(oldFilePath, (err) => {
                    if (err) console.error("Error deleting old file:", oldFilePath, err);
                });
            }

            res.status(200).json({ 
                message: `${documentType} re-uploaded successfully and is pending review.`
            });

        } else {
            // Step 3: INSERT if it does not exist (it's a new upload)
            await db.query(
                'INSERT INTO driver_documents (driver_id, document_type, file_url, status) VALUES ($1, $2, $3, $4)',
                [driverId, documentType.toLowerCase(), fileUrl, 'pending']
            );
            
            res.status(201).json({ 
                message: `${documentType} uploaded successfully.`
            });
        }

    } catch (err) {
        // If anything goes wrong, delete the newly uploaded file before sending an error
        fs.unlinkSync(req.file.path); 
        console.error('Error saving document:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// --- UPDATED Verification Status Endpoint ---
router.get('/status', tokenVerify, async (req, res) => {
    const userId = req.user.userId;
    try {
        // First, get the driver's ID and overall verification status
        const driverResult = await db.query(
            'SELECT id, is_verified FROM drivers WHERE user_id = $1',
            [userId]
        );

        if (driverResult.rows.length === 0) {
            return res.status(404).json({ message: 'Driver profile not found.' });
        }

        const driver = driverResult.rows[0];

        // If the driver is already verified, no need to check documents
        if (driver.is_verified) {
            return res.status(200).json({ isVerified: true });
        }

        // If not verified, check for rejected documents
        const rejectedDocsResult = await db.query(
            `SELECT document_type, rejection_reason 
             FROM driver_documents 
             WHERE driver_id = $1 AND status = 'rejected'`,
            [driver.id]
        );

        if (rejectedDocsResult.rows.length > 0) {
            // If there are rejected documents, return the details
            return res.status(200).json({
                isVerified: false,
                status: 'rejected',
                rejectedDocuments: rejectedDocsResult.rows.map(doc => ({
                    documentType: doc.document_type,
                    reason: doc.rejection_reason
                }))
            });
        } else {
            // If no documents are rejected, the status is pending
            return res.status(200).json({
                isVerified: false,
                status: 'pending'
            });
        }

    } catch (err) {
        console.error('Error fetching driver status:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;