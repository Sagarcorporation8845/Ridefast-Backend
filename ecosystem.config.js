module.exports = {
    apps : [{
      name   : "api-gateway",
      script : "./index.js",
      watch: false
    }, {
      name   : "user-service",
      script : "./packages/user-service/index.js",
      watch: false
    }, {
      name   : "driver-service",
      script : "./packages/driver-service/index.js",
      watch: false
    }]
  }
  
  