// packages/user-service/db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

// A new async function that we will call on server startup.
const connectDb = async () => {
  try {
    const client = await pool.connect();
    console.log('Database connected successfully!');
    client.release(); // Immediately release the client back to the pool
  } catch (err) {
    console.error('FATAL: Failed to connect to the database. Please check your .env file and database status.');
    console.error(err.stack);
    process.exit(1); // Exit the application if we cannot connect to the DB
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  connectDb, // Export the new function
};