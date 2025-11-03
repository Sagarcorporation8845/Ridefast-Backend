// packages/user-service/newrelic.js
'use strict'
exports.config = {
  // ⬇️ SET A UNIQUE NAME FOR EACH SERVICE
  app_name: ['User-Service'], 
  
  // ⬇️ PASTE YOUR INGEST-LICENSE KEY HERE
  license_key: 'eu01xxb447f1ca7e3413b2902c8432f6FFFFNRAL',
  
  logging: {
    level: 'info'
  },
  application_logging: {
    forwarding: {
      enabled: true 
    }
  }
}