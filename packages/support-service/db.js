// packages/support-service/db.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load CA certificate
const caPath = path.join(__dirname, 'ca.pem'); // make sure ca.pem is in packages/support-service/
const caCert = fs.readFileSync(caPath).toString();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  ssl: {
    rejectUnauthorized: true,  // verify server identity
    ca: caCert,                // use Aiven CA certificate
  },
  max: 1, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// A new async function that we will call on server startup.
const connectDb = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ [support-service] Database connected successfully!');
    client.release(); // Release client back to pool
  } catch (err) {
    console.error('❌ FATAL: [support-service] Failed to connect to the database.');
    console.error(err.message || err.stack);
    process.exit(1);
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  connectDb,
};
