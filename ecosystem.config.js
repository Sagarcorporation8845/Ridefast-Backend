require('dotenv').config(); // Make sure to load .env variables
// ecosystem.config.js
// This file will now manage all your secrets
module.exports = {
  apps : [
    {
      name   : "api-gateway",
      script : "./index.js", // Assuming this is correct
      watch  : false,
      env: {
        "PORT": 3000,
        "NEW_RELIC_APP_NAME": "ridefast-api-gateway",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "user-service",
      script : "./packages/user-service/index.js",
      watch  : false,
      env: {
        "PORT": 3001, // dotenv will override this if USER_SERVICE_PORT is set, which is fine
        "NEW_RELIC_APP_NAME": "ridefast-user-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "driver-service",
      script : "./packages/driver-service/index.js",
      watch  : false,
      env: {
        "PORT": 3002,
        "NEW_RELIC_APP_NAME": "ridefast-driver-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "support-service",
      script : "./packages/support-service/index.js",
      watch  : false,
      env: {
        "PORT": 3003,
        "NEW_RELIC_APP_NAME": "ridefast-support-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "admin-service",
      script : "./packages/admin-service/index.js",
      watch  : false,
      env: {
        "PORT": 3004,
        "NEW_RELIC_APP_NAME": "ridefast-admin-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "verification-service",
      script : "./packages/verification-service/index.js",
      watch  : false,
      env: {
        "PORT": 3005,
        "NEW_RELIC_APP_NAME": "ridefast-verification-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "ride-service",
      script : "./packages/ride-service/index.js",
      watch  : false,
      env: {
        "PORT": 3006,
        "NEW_RELIC_APP_NAME": "ridefast-ride-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "pricing-service",
      script : "./packages/pricing-service/index.js",
      watch  : false,
      env: {
        "PORT": 3007,
        "NEW_RELIC_APP_NAME": "ridefast-pricing-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "maps-service",
      script : "./packages/maps-service/index.js",
      watch  : false,
      env: {
        "PORT": 3008,
        "NEW_RELIC_APP_NAME": "ridefast-maps-service",
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    }
  ]
};

  
  