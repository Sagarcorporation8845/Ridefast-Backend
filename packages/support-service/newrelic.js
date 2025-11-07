// packages/user-service/newrelic.js
'use strict'
exports.config = {
  // ⬇️ SET A UNIQUE NAME FOR EACH SERVICE
  app_name: ['Support-Service'], 
  
  // ⬇️ PASTE YOUR INGEST-LICENSE KEY HERE
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  
  logging: {
    level: 'info'
  },
  application_logging: {
    forwarding: {
      enabled: true 
    }
  }
}