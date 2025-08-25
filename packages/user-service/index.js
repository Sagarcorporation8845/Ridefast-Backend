// packages/user-service/index.js

// --- The Definitive Fix ---
// Use the 'path' module to build an absolute path to the .env file.
// This ensures it's found correctly, no matter where you run the script from.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const db = require('./db'); // db is now loaded *after* dotenv is configured
const authRoutes = require('./routes/auth');

const app = express();
app.use(express.json());

const PORT = process.env.USER_SERVICE_PORT || 3001;

// --- API ROUTES ---
app.use('/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('User Service is healthy and running!');
});

app.listen(PORT, () => {
  console.log(`User Service is running on port ${PORT}`);
});