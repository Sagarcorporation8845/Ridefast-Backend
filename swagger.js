// swagger.js - Centralized API Documentation
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RideFast Backend API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for all RideFast microservices',
      contact: {
        name: 'RideFast Development Team',
        email: 'dev@ridefast.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost',
        description: 'Development server'
      },
      {
        url: 'https://api.ridefast.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication'
        }
      },
      schemas: {
        // Common schemas
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                message: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                details: { type: 'array', items: { type: 'object' } }
              }
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' }
          }
        },
        // User Service schemas
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            phoneNumber: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            createdAt: { type: 'string', format: 'date-time' },
            dateOfBirth: { type: 'string', format: 'date' },
            gender: { type: 'string' },
            homeAddress: { type: 'string' },
            workAddress: { type: 'string' }
          }
        },
        // Driver Service schemas
        Driver: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            city: { type: 'string' },
            status: { type: 'string', enum: ['pending_verification', 'active', 'suspended'] },
            isVerified: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        // Support Service schemas
        SupportTicket: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', format: 'uuid' },
            assignedAgentId: { type: 'string', format: 'uuid' },
            city: { type: 'string' },
            subject: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
            type: { type: 'string', enum: ['text', 'voice_call'] },
            status: { type: 'string', enum: ['open', 'in_progress', 'pending_customer', 'resolved', 'closed'] },
            createdAt: { type: 'string', format: 'date-time' },
            assignedAt: { type: 'string', format: 'date-time' },
            resolvedAt: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time' }
          }
        },
        // Admin Service schemas
        PlatformStaff: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['central_admin', 'city_admin', 'support'] },
            city: { type: 'string' },
            status: { type: 'string', enum: ['active', 'suspended', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    tags: [
      {
        name: 'User Service',
        description: 'User authentication, profiles, and location management'
      },
      {
        name: 'Driver Service', 
        description: 'Driver onboarding, profiles, and document management'
      },
      {
        name: 'Support Service',
        description: 'Support ticket management and agent operations'
      },
      {
        name: 'Admin Service',
        description: 'Administrative operations and agent management'
      },
      {
        name: 'Signaling Service',
        description: 'Real-time WebSocket communication'
      }
    ],
    paths: {
      // ==========================================
      // USER SERVICE ENDPOINTS
      // ==========================================
      '/user-service/auth/send-otp': {
        post: {
          tags: ['User Service'],
          summary: 'Send OTP for phone verification',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phoneNumber: { type: 'string', example: '+919876543210' }
                  },
                  required: ['phoneNumber']
                }
              }
            }
          },
          responses: {
            200: { description: 'OTP sent successfully' },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/user-service/auth/verify-otp': {
        post: {
          tags: ['User Service'],
          summary: 'Verify OTP and authenticate user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phoneNumber: { type: 'string' },
                    otp: { type: 'string' }
                  },
                  required: ['phoneNumber', 'otp']
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Authentication successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/user-service/profile': {
        get: {
          tags: ['User Service'],
          summary: 'Get user profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'User profile retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' }
                }
              }
            },
            401: { $ref: '#/components/schemas/Error' }
          }
        },
        put: {
          tags: ['User Service'],
          summary: 'Update user profile',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    dateOfBirth: { type: 'string', format: 'date' },
                    gender: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },

      // ==========================================
      // DRIVER SERVICE ENDPOINTS  
      // ==========================================
      '/driver-service/onboarding/register': {
        post: {
          tags: ['Driver Service'],
          summary: 'Register as a driver',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    city: { type: 'string', example: 'Mumbai' }
                  },
                  required: ['city']
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Driver registration successful',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Driver' }
                }
              }
            },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/driver-service/onboarding/documents': {
        post: {
          tags: ['Driver Service'],
          summary: 'Upload driver documents',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    documentType: { type: 'string', enum: ['license', 'rc', 'photo', 'aadhaar'] },
                    file: { type: 'string', format: 'binary' }
                  },
                  required: ['documentType', 'file']
                }
              }
            }
          },
          responses: {
            201: { $ref: '#/components/schemas/Success' },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },

      // ==========================================
      // SUPPORT SERVICE ENDPOINTS
      // ==========================================
      '/support-service/tickets': {
        post: {
          tags: ['Support Service'],
          summary: 'Create new support ticket',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    customerId: { type: 'string', format: 'uuid' },
                    subject: { type: 'string', minLength: 5, maxLength: 255 },
                    description: { type: 'string', minLength: 10, maxLength: 2000 },
                    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
                    type: { type: 'string', enum: ['text', 'voice_call'], default: 'text' }
                  },
                  required: ['customerId', 'subject', 'description']
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Ticket created successfully',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Success' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              ticket: { $ref: '#/components/schemas/SupportTicket' }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            400: { $ref: '#/components/schemas/Error' }
          }
        },
        get: {
          tags: ['Support Service'],
          summary: 'Get agent assigned tickets',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['open', 'in_progress', 'pending_customer', 'resolved', 'closed'] }
            },
            {
              name: 'priority',
              in: 'query', 
              schema: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
            }
          ],
          responses: {
            200: {
              description: 'Tickets retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Success' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              tickets: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/SupportTicket' }
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            401: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/support-service/tickets/{id}': {
        get: {
          tags: ['Support Service'],
          summary: 'Get ticket details with messages',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' }
            }
          ],
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            404: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/support-service/tickets/{id}/status': {
        put: {
          tags: ['Support Service'],
          summary: 'Update ticket status',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' }
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['open', 'in_progress', 'pending_customer', 'resolved', 'closed'] }
                  },
                  required: ['status']
                }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/support-service/agent/status': {
        post: {
          tags: ['Support Service'],
          summary: 'Update agent online/offline status',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['online', 'offline', 'busy'] }
                  },
                  required: ['status']
                }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/support-service/agent/workload': {
        get: {
          tags: ['Support Service'],
          summary: 'Get agent current workload',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Workload information retrieved',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Success' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              agentStatus: {
                                type: 'object',
                                properties: {
                                  agentId: { type: 'string', format: 'uuid' },
                                  status: { type: 'string', enum: ['online', 'offline', 'busy'] },
                                  activeTicketsCount: { type: 'integer' },
                                  lastActivity: { type: 'string', format: 'date-time' }
                                }
                              },
                              workload: {
                                type: 'object',
                                properties: {
                                  totalActiveTickets: { type: 'integer' },
                                  maxCapacity: { type: 'integer', example: 2 },
                                  availableSlots: { type: 'integer' }
                                }
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            401: { $ref: '#/components/schemas/Error' }
          }
        }
      },

      // ==========================================
      // ADMIN SERVICE ENDPOINTS
      // ==========================================
      '/admin-service/admin/agents': {
        post: {
          tags: ['Admin Service'],
          summary: 'Create support agent',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string', minLength: 2, maxLength: 255 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    city: { type: 'string', minLength: 2, maxLength: 100 }
                  },
                  required: ['fullName', 'email', 'password', 'city']
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Agent created successfully',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Success' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              agent: { $ref: '#/components/schemas/PlatformStaff' }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            409: { $ref: '#/components/schemas/Error' }
          }
        },
        get: {
          tags: ['Admin Service'],
          summary: 'Get agents list (city-filtered)',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'city',
              in: 'query',
              schema: { type: 'string' },
              description: 'Filter by city (for central admin)'
            }
          ],
          responses: {
            200: {
              description: 'Agents retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Success' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              agents: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/PlatformStaff' }
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            403: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/admin-service/admin/agents/{id}/status': {
        put: {
          tags: ['Admin Service'],
          summary: 'Update agent status',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' }
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['active', 'suspended', 'inactive'] }
                  },
                  required: ['status']
                }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            404: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/admin-service/admin/tickets/reassign': {
        get: {
          tags: ['Admin Service'],
          summary: 'Get ticket reassignment candidates',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'ticketId',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' }
            }
          ],
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            404: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '/admin-service/admin/tickets/{id}/reassign': {
        post: {
          tags: ['Admin Service'],
          summary: 'Manually reassign ticket',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' }
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agentId: { type: 'string', format: 'uuid' },
                    reason: { type: 'string', maxLength: 500 }
                  },
                  required: ['agentId']
                }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/schemas/Success' },
            400: { $ref: '#/components/schemas/Error' }
          }
        }
      },

      // ==========================================
      // SIGNALING SERVICE ENDPOINTS
      // ==========================================
      '/signaling-service/': {
        get: {
          tags: ['Signaling Service'],
          summary: 'WebSocket service health check',
          responses: {
            200: {
              description: 'Service status and connection info',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      service: { type: 'string' },
                      status: { type: 'string' },
                      version: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                      connectedClients: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: [] // We're defining everything inline above
};

const specs = swaggerJsdoc(options);

module.exports = {
  specs,
  swaggerUi,
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'RideFast API Documentation'
  })
};