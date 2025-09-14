const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load CA certificate
const caPath = path.join(__dirname, '../ca.pem');
const caCert = fs.readFileSync(caPath).toString();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE || process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    ssl: {
        rejectUnauthorized: true,
        ca: caCert,
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
    console.log('[admin-service] Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('[admin-service] Database connection error:', err);
});

module.exports = pool;