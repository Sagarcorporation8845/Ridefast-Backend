'use strict'

exports.config = {
  
  app_name: ['pricing-service'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  
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