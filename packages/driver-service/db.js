// packages/driver-service/db.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// NOTE: You will need to copy the 'ca.pem' file from user-service to driver-service
const caPath = path.join(__dirname, 'ca.pem'); 
const caCert = fs.readFileSync(caPath).toString();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  ssl: {
    rejectUnauthorized: true,
    ca: caCert,
  },
});

const connectDb = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully!');
    client.release();
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
