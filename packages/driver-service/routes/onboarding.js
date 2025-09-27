// packages/driver-service/routes/onboarding.js
const express = require('express');
const db = require('../db');
const tokenVerify = require('../middleware/token-verify');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// --- SECURED ENDPOINT: Get Active Cities ---
router.get('/cities', tokenVerify, async (req, res) => {
    try {
        const { rows } = await db.query(
            "SELECT city_name FROM servicable_cities WHERE status = 'active' ORDER BY city_name"
        );
        res.status(200).json({ success: true, cities: rows.map(c => c.city_name) });
    } catch (error) {
        console.error('Error fetching serviceable cities:', error);
        res.status(500).json({ success: false, message: 'Could not retrieve city list.' });
    }
});


// --- Personal Details Endpoint (With Full Name, City, Email, DOB, and Gender Validation) ---
router.post('/personal-details', tokenVerify, async (req, res) => {
    let { fullName, city, email, dob, gender } = req.body;
    const userId = req.user.userId;

    if (!fullName || !city || !email || !dob || !gender) {
        return res.status(400).json({ message: 'Full name, city, email, date of birth, and gender are required.' });
    }

    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(fullName)) {
        return res.status(400).json({ message: 'Full name can only contain letters and spaces.' });
    }
    fullName = fullName.trim();

    if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ message: 'Invalid email format.' });
    }
    
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(dob)) {
        return res.status(400).json({ message: 'Invalid date of birth format. Please use YYYY-MM-DD.' });
    }

    const standardizedCity = city.trim().toLowerCase();

    try {
        const cityCheck = await db.query(
            "SELECT id FROM servicable_cities WHERE city_name = $1 AND status = 'active'",
            [standardizedCity]
        );

        if (cityCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Sorry, we do not currently operate in this city.' });
        }

        await db.query(
            'UPDATE users SET full_name = $1, email = $2, date_of_birth = $3, gender = $4 WHERE id = $5',
            [fullName, email, dob, gender, userId]
        );
        const { rows } = await db.query(
            'INSERT INTO drivers (user_id, city) VALUES ($1, $2) RETURNING id',
            [userId, standardizedCity]
        );
        
        const driverId = rows[0].id;
        res.status(201).json({ 
            message: 'Personal details saved. Proceed to vehicle details.',
            driverId: driverId 
        });

    } catch (err) {
        if (err.code === '23505') { 
            if (err.constraint === 'users_email_key') {
                return res.status(409).json({ message: 'An account with this email address already exists.' });
            }
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


// --- SECURED Vehicle Details Endpoint (With Registration Number Standardization and Validation) ---
router.post('/vehicle-details', tokenVerify, async (req, res) => {
    const { vehicleType, registrationNumber, modelName, fuelType } = req.body;
    const userId = req.user.userId; 

    const allowedVehicleTypes = ['bike', 'auto', 'car', 'commercial'];
    const allowedFuelTypes = ['electric', 'petrol', 'diesel', 'hybrid', 'cng'];

    if (!vehicleType || !registrationNumber || !modelName || !fuelType) {
        return res.status(400).json({ message: 'All vehicle fields are required.' });
    }
    if (!allowedVehicleTypes.includes(vehicleType.toLowerCase())) {
        return res.status(400).json({ message: `Invalid vehicle type.` });
    }
    if (!allowedFuelTypes.includes(fuelType.toLowerCase())) {
        return res.status(400).json({ message: `Invalid fuel type.` });
    }

    const standardizedRegNumber = registrationNumber.replace(/[\s-]/g, '').toUpperCase();
    
    const registrationNumberRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
    if (!registrationNumberRegex.test(standardizedRegNumber)) {
        return res.status(400).json({ message: 'Please enter a correct vehicle number. Follow this format: MH01AB1234' });
    }

    try {
        const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
        if (driverResult.rows.length === 0) {
            return res.status(403).json({ message: 'No driver profile found for this user. Cannot add vehicle.' });
        }
        const driverId = driverResult.rows[0].id;

        await db.query(
            'INSERT INTO driver_vehicles (driver_id, category, registration_number, model_name, fuel_type) VALUES ($1, $2, $3, $4, $5)',
            [driverId, vehicleType.toLowerCase(), standardizedRegNumber, modelName, fuelType.toLowerCase()]
        );
        res.status(201).json({ message: 'Vehicle details saved. Proceed to document upload.' });
    } catch (err) {
        if (err.code === '23505') { 
             return res.status(409).json({ message: 'A vehicle with this registration number already exists.' });
        }
        console.error('Error saving vehicle details:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// --- Multer Configuration for Document Uploads (With File Type Validation) ---
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const userId = req.user.userId; 
        try {
            const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
            if (driverResult.rows.length === 0) {
                 return cb(new Error('No driver profile found for this user.'), null);
            }
            const driverId = driverResult.rows[0].id;
            const dir = path.join(__dirname, '..', 'uploads', driverId.toString());
            
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

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // 5MB file size limit
});


// --- UPDATED SECURED Document Upload Endpoint ---
router.post('/upload-document', tokenVerify, (req, res) => {
    const singleUpload = upload.single('document');

    singleUpload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `File upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ message: err.message });
        }
        _handleDocumentUpload(req, res);
    });
});

async function _handleDocumentUpload(req, res) {
    const { documentType } = req.body;
    const driverId = req.driverId; 
    
    if (!req.file) {
        return res.status(400).json({ message: 'No file was uploaded.' });
    }
    if (!documentType) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'documentType is required.' });
    }

    // --- ADDED VALIDATION ---
    const allowedDocumentTypes = ['license', 'rc', 'photo', 'aadhaar'];
    if (!allowedDocumentTypes.includes(documentType.toLowerCase())) {
        fs.unlinkSync(req.file.path); // Clean up the uploaded file
        return res.status(400).json({ message: 'Invalid documentType. Must be one of: license, rc, photo, aadhaar' });
    }
    // --- END ADDED VALIDATION ----

    const fileUrl = `/uploads/${driverId}/${req.file.filename}`;

    try {
        const existingDoc = await db.query(
            'SELECT id, file_url FROM driver_documents WHERE driver_id = $1 AND document_type = $2',
            [driverId, documentType.toLowerCase()]
        );

        if (existingDoc.rows.length > 0) {
            const oldFileUrl = existingDoc.rows[0].file_url;
            await db.query(
                `UPDATE driver_documents 
                 SET file_url = $1, status = 'pending', rejection_reason = NULL, uploaded_at = NOW()
                 WHERE id = $2`,
                [fileUrl, existingDoc.rows[0].id]
            );

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
            await db.query(
                'INSERT INTO driver_documents (driver_id, document_type, file_url, status) VALUES ($1, $2, $3, $4)',
                [driverId, documentType.toLowerCase(), fileUrl, 'pending']
            );
            
            res.status(201).json({ 
                message: `${documentType} uploaded successfully.`
            });
        }

    } catch (err) {
        fs.unlinkSync(req.file.path); 
        console.error('Error saving document:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}


// --- Verification Status Endpoint ---
router.get('/status', tokenVerify, async (req, res) => {
    const userId = req.user.userId;
    try {
        const driverResult = await db.query(
            'SELECT id, is_verified FROM drivers WHERE user_id = $1',
            [userId]
        );

        if (driverResult.rows.length === 0) {
            return res.status(404).json({ message: 'Driver profile not found.' });
        }

        const driver = driverResult.rows[0];

        if (driver.is_verified) {
            return res.status(200).json({ isVerified: true });
        }

        const rejectedDocsResult = await db.query(
            `SELECT document_type, rejection_reason 
             FROM driver_documents 
             WHERE driver_id = $1 AND status = 'rejected'`,
            [driver.id]
        );

        if (rejectedDocsResult.rows.length > 0) {
            return res.status(200).json({
                isVerified: false,
                status: 'rejected',
                rejectedDocuments: rejectedDocsResult.rows.map(doc => ({
                    documentType: doc.document_type,
                    reason: doc.rejection_reason
                }))
            });
        } else {
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