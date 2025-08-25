// packages/user-service/db.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load CA certificate
const caPath = path.join(__dirname, 'ca.pem'); // make sure ca.pem is in packages/user-service/
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
});

// A new async function that we will call on server startup.
const connectDb = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully!');
    client.release(); // Release client back to pool
  } catch (err) {
    console.error('❌ FATAL: Failed to connect to the database.');
    console.error(err.message || err.stack);
    process.exit(1);
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  connectDb,
};
