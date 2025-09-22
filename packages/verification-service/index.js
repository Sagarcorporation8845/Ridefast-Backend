// packages/verification-service/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');
const documentRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.VERIFICATION_SERVICE_PORT || 3005;

app.use(cors());
app.use(express.json());

app.use('/documents', documentRoutes);

app.get('/health', (req, res) => {
    res.json({
        service: 'Verification Service',
        status: 'healthy',
        timestamp: new Date()
    });
});

const startServer = async () => {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`[verification-service] Verification Service running on port ${PORT}`);
    });
};

startServer();