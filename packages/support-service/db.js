// packages/support-service/db.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// The CA cert is copied from the user-service directory for consistency
const caPath = path.resolve(__dirname, '../user-service/ca.pem'); 
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
    console.log('✅ [support-service] Database connected successfully!');
    client.release();
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
