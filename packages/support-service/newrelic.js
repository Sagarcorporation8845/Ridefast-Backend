'use strict'

exports.config = {
  
  app_name: ['support-service'],
  license_key: 'eu01xxb447f1ca7e3413b2902c8432f6FFFFNRAL',
  
  logging: {
    level: 'info'
  },

  allow_all_headers: true,
  
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'response.headers.set-cookie'
    ]
  }
}