module.exports = {
    apps : [{
      name   : "api-gateway",
      script : "./index.js",
      watch: false,
      env: {
        PORT: 80
      }
    }, {
      name   : "user-service",
      script : "./packages/user-service/index.js",
      watch: false,
      env: {
        USER_SERVICE_PORT: 3001
      }
    }, {
      name   : "driver-service",
      script : "./packages/driver-service/index.js",
      watch: false,
      env: {
        DRIVER_SERVICE_PORT: 3002
      }
    }, {
      name   : "support-service",
      script : "./packages/support-service/index.js",
      watch: false,
      env: {
        SUPPORT_SERVICE_PORT: 3003
      }
    }, {
      name   : "admin-service",
      script : "./packages/admin-service/index.js",
      watch: false,
      env: {
        PORT: 3004
      }
    }, {
      name   : "signaling-service",
      script : "./packages/signaling-service/index.js",
      watch: false,
      env: {
        SIGNALING_SERVICE_PORT: 3005
      }
    }]
  }
  
  