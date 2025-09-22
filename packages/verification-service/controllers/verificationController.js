// packages/verification-service/controllers/verificationController.js
const { query } = require('../db');

// Helper function to validate if a string is a UUID
const isUuid = (id) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
};

// Get a list of drivers pending verification
const getPendingDrivers = async (req, res) => {
    const { city, role } = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    try {
        let countQuery = `
            SELECT COUNT(d.id) 
            FROM drivers d 
            WHERE d.status = 'pending_verification' AND d.is_verified = false
        `;
        let dataQuery = `
            SELECT 
                d.id as driver_id, 
                u.full_name, 
                d.city,
                d.created_at as registration_date,
                dv.model_name,
                dv.registration_number,
                dv.category as vehicle_category
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN driver_vehicles dv ON d.id = dv.driver_id
            WHERE d.status = 'pending_verification' AND d.is_verified = false
        `;
        
        const params = [];
        if (role === 'city_admin' || role === 'support') {
            const cityParam = `$${params.length + 1}`;
            // --- FIX: Made city comparison case-insensitive ---
            countQuery += ` AND LOWER(d.city) = LOWER(${cityParam})`;
            dataQuery += ` AND LOWER(d.city) = LOWER(${cityParam})`;
            params.push(city);
        }
        
        dataQuery += ` ORDER BY d.created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const countResult = await query(countQuery, params);
        const dataResult = await query(dataQuery, [...params, limit, offset]);
        
        const totalItems = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({ 
            success: true, 
            drivers: dataResult.rows,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems
            }
        });

    } catch (error) {
        console.error('Error fetching pending drivers:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get all documents for a specific driver
const getDriverDocuments = async (req, res) => {
    const { driverId } = req.params;

    // --- FIX: Added validation for the driverId parameter ---
    if (!isUuid(driverId)) {
        return res.status(400).json({ success: false, message: 'Invalid Driver ID format.' });
    }

    try {
        const { rows } = await query(
            `SELECT id as document_id, document_type, file_url, status, rejection_reason, uploaded_at 
             FROM driver_documents WHERE driver_id = $1 ORDER BY document_type`,
            [driverId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No documents found for this driver.' });
        }
        
        res.status(200).json({ success: true, documents: rows });

    } catch (error) {
        console.error(`Error fetching documents for driver ${driverId}:`, error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateDocumentStatus = async (req, res) => {
    const { documentId } = req.params;
    const { status, rejection_reason } = req.body;

    // --- FIX: Added validation for the documentId parameter ---
    if (!isUuid(documentId)) {
        return res.status(400).json({ success: false, message: 'Invalid Document ID format.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    if (status === 'rejected' && !rejection_reason) {
        return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    try {
        const { rows } = await query(
            `UPDATE driver_documents 
             SET status = $1, rejection_reason = $2 
             WHERE id = $3 RETURNING driver_id`,
            [status, rejection_reason || null, documentId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        if (status === 'approved') {
            const driverId = rows[0].driver_id;
            const docsResult = await query(
                `SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved 
                 FROM driver_documents WHERE driver_id = $1`,
                [driverId]
            );

            const { total, approved } = docsResult.rows[0];
            if (parseInt(total, 10) >= 4 && parseInt(total, 10) === parseInt(approved, 10)) {
                await query(
                    "UPDATE drivers SET is_verified = true, status = 'active' WHERE id = $1",
                    [driverId]
                );
            }
        }
        
        res.status(200).json({ success: true, message: `Document status updated to ${status}` });

    } catch (error) {
        console.error('Error updating document status:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    getPendingDrivers,
    getDriverDocuments,
    updateDocumentStatus,
};