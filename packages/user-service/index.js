// packages/user-service/index.js
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.USER_SERVICE_PORT || 3001;

// --- API ROUTES WILL GO HERE ---
app.get('/', (req, res) => {
  res.send('User Service is running!');
});

app.listen(PORT, () => {
  console.log(`User Service listening on port ${PORT}`);
});