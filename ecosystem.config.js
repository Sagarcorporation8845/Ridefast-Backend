require('dotenv').config(); // Make sure to load .env variables

module.exports = {
    apps : [{
      name   : "api-gateway",
      script : "./index.js",
      watch: false,
      env: {
        PORT: process.env.PORT || 80
      }
    }, {
      name   : "user-service",
      script : "./packages/user-service/index.js",
      watch: false,
      env: {
        PORT: process.env.USER_SERVICE_PORT || 3001
      }
    }, {
      name   : "driver-service",
      script : "./packages/driver-service/index.js",
      watch: false,
      env: {
        PORT: process.env.DRIVER_SERVICE_PORT || 3002
      }
    }, {
      name   : "support-service",
      script : "./packages/support-service/index.js",
      watch: false,
      env: {
        PORT: process.env.SUPPORT_SERVICE_PORT || 3003
      }
    }, {
      name   : "admin-service",
      script : "./packages/admin-service/index.js",
      watch: false,
      env: {
        PORT: process.env.ADMIN_SERVICE_PORT || 3004
      }
    }, {
      name   : "signaling-service",
      script : "./packages/signaling-service/index.js",
      watch: false,
      env: {
        PORT: process.env.SIGNALING_SERVICE_PORT || 3005
      }
    }, {
      name   : "location-service",
      script : "./packages/location-service/index.js",
      watch: false,
      env: {
        PORT: process.env.LOCATION_SERVICE_PORT || 3006
      }
    }, {
      name   : "pricing-service",
      script : "./packages/pricing-service/index.js",
      watch: false,
      env: {
        PORT: process.env.PRICING_SERVICE_PORT || 3007
      }
    }, {
      name   : "ride-service",
      script : "./packages/ride-service/index.js",
      watch: false,
      env: {
        PORT: process.env.RIDE_SERVICE_PORT || 3008
      }
    }]
  }
  
  