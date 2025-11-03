require('dotenv').config(); // Make sure to load .env variables
module.exports = {
  apps : [
    {
      name   : "api-gateway",
      script : "./packages/api-gateway/index.js",
      watch  : false,
      env: {
        "PORT": 3000,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "user-service",
      script : "./packages/user-service/index.js",
      watch  : false,
      env: {
        "PORT": 3001,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "driver-service",
      script : "./packages/driver-service/index.js",
      watch  : false,
      env: {
        "PORT": 3002,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "support-service",
      script : "./packages/support-service/index.js",
      watch  : false,
      env: {
        "PORT": 3003,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "admin-service",
      script : "./packages/admin-service/index.js",
      watch  : false,
      env: {
        "PORT": 3004,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "verification-service",
      script : "./packages/verification-service/index.js",
      watch  : false,
      env: {
        "PORT": 3005,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "ride-service",
      script : "./packages/ride-service/index.js",
      watch  : false,
      env: {
        "PORT": 3006,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "pricing-service",
      script : "./packages/pricing-service/index.js",
      watch  : false,
      env: {
        "PORT": 3007,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    },
    {
      name   : "maps-service",
      script : "./packages/maps-service/index.js",
      watch  : false,
      env: {
        "PORT": 3008,
        "NEW_RELIC_LICENSE_KEY": "eu01xx6dd3b63a254db8837480b83b43FFFFNRAL"
      }
    }
  ]
};