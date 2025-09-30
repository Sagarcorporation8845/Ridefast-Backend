// packages/support-service/middleware/queryValidation.js
const Joi = require('joi');

// Common validation schemas for query parameters
const commonSchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  }),

  search: Joi.object({
    q: Joi.string().min(1).max(255).required(),
    type: Joi.string().valid('driver', 'customer').default('customer')
  }),

  dateRange: Joi.object({
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional()
  }),

  period: Joi.object({
    period: Joi.string().valid('7d', '30d', '90d', '1y').default('30d')
  }),

  weekStart: Joi.object({
    week_start: Joi.date().iso().optional()
  }),

  financialPeriod: Joi.object({
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().min(Joi.ref('start_date')).optional(),
    period: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').default('monthly')
  })
};

// Specific validation schemas for different routes
const routeSchemas = {
  // Search route
  search: commonSchemas.pagination.concat(commonSchemas.search),

  // Dashboard routes
  dashboardOverview: commonSchemas.pagination,
  
  dashboardAnalytics: commonSchemas.pagination.concat(Joi.object({
    period: Joi.string().valid('7d', '30d', '90d', '1y').default('7d')
  })),

  // Driver routes
  driversList: commonSchemas.pagination.concat(commonSchemas.search).concat(Joi.object({
    status: Joi.string().valid('active', 'suspended', 'pending_verification', 'inactive').optional(),
    verification_status: Joi.string().valid('verified', 'unverified', 'pending').optional()
  })),

  driverStatusUpdate: Joi.object({
    status: Joi.string().valid('active', 'suspended', 'pending_verification').required(),
    reason: Joi.string().max(500).optional()
  }),

  driverDocumentVerify: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    rejection_reason: Joi.string().max(500).optional()
  }),

  driverAction: Joi.object({
    action_type: Joi.string().valid('warning', 'fine', 'suspension').required(),
    reason: Joi.string().max(500).required(),
    fine_amount: Joi.number().positive().optional(),
    suspension_duration: Joi.number().integer().positive().optional()
  }),

  // Ride routes
  ridesList: commonSchemas.pagination.concat(commonSchemas.search).concat(commonSchemas.dateRange).concat(Joi.object({
    status: Joi.string().valid('requested', 'accepted', 'in_progress', 'completed', 'cancelled').optional()
  })),

  rideStatusUpdate: Joi.object({
    status: Joi.string().valid('cancelled', 'completed').required(),
    reason: Joi.string().max(500).optional()
  }),

  rideAnalytics: Joi.object({
    period: Joi.string().valid('7d', '30d', '1y').default('7d')
  }),

  // User routes
  usersList: commonSchemas.pagination.concat(commonSchemas.search).concat(Joi.object({
    user_type: Joi.string().valid('customer', 'driver', 'all').default('customer')
  })),

  walletAdjustment: Joi.object({
    amount: Joi.number().required(),
    type: Joi.string().valid('refund', 'adjustment', 'fine').required(),
    reason: Joi.string().max(500).required()
  }),

  userAnalytics: Joi.object({
    period: Joi.string().valid('7d', '30d', '1y').default('30d')
  }),

  // Support routes
  supportTickets: commonSchemas.pagination.concat(Joi.object({
    status: Joi.string().valid('open', 'in_progress', 'pending_admin', 'resolved', 'closed').optional(),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional()
  })),

  createTicket: Joi.object({
    customerId: Joi.string().uuid().required(),
    subject: Joi.string().min(5).max(255).required(),
    description: Joi.string().min(10).max(2000).required(),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
    category: Joi.string().max(100).optional()
  }),

  updateTicketStatus: Joi.object({
    status: Joi.string().valid('open', 'pending_admin', 'resolved').required()
  }),

  broadcast: Joi.object({
    message: Joi.string().min(10).max(1000).required(),
    target_audience: Joi.string().valid('drivers', 'customers', 'all').required(),
    urgency: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal')
  }),

  // Report routes
  dailyReport: Joi.object({
    date: Joi.date().iso().default(() => new Date().toISOString().split('T')[0])
  }),

  weeklyReport: Joi.object({
    week_start: Joi.date().iso().optional()
  }),

  financialReport: commonSchemas.financialPeriod,

  driverPerformanceReport: Joi.object({
    period: Joi.string().valid('7d', '30d', '90d').default('30d'),
    sort_by: Joi.string().valid('total_rides', 'completion_rate', 'earnings', 'rating').default('total_rides'),
    limit: Joi.number().integer().min(1).max(100).default(50)
  })
};

// Validation middleware factory
const validateQuery = (schemaName) => {
  return (req, res, next) => {
    const schema = routeSchemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        success: false,
        message: 'Validation schema not found'
      });
    }

    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Query validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }))
      });
    }

    req.query = value;
    next();
  };
};

// Body validation middleware factory
const validateBody = (schemaName) => {
  return (req, res, next) => {
    const schema = routeSchemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        success: false,
        message: 'Validation schema not found'
      });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Request body validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }))
      });
    }

    req.body = value;
    next();
  };
};

// Sanitization middleware for additional security
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  req.query = sanitizeObject(req.query);
  req.body = sanitizeObject(req.body);
  
  next();
};

module.exports = {
  validateQuery,
  validateBody,
  sanitizeInput,
  routeSchemas,
  commonSchemas
};