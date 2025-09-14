// packages/user-service/index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const express = require('express');
const db = require('./db');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const locationRoutes = require('./routes/locations'); 


const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// API ROUTES
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/locations', locationRoutes);


// Health check route
app.get('/', (req, res) => {
  res.send('User Service is healthy and running!');
});

app.listen(PORT, () => {
  console.log(`User Service is running on port ${PORT}`);
});