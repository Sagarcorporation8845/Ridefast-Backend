const Joi = require('joi');

// Validation middleware factory
const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    details: error.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    })),
                    timestamp: new Date()
                }
            });
        }
        
        next();
    };
};

// Validation schemas
const schemas = {
    createAgent: Joi.object({
        fullName: Joi.string().min(2).max(255).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        city: Joi.string().min(2).max(100).required(),
        role: Joi.string().valid('support').default('support')
    }),

    updateAgentStatus: Joi.object({
        status: Joi.string().valid('active', 'suspended', 'inactive').required()
    }),

    reassignTicket: Joi.object({
        agentId: Joi.string().uuid().required(),
        reason: Joi.string().max(500).optional()
    }),

    agentStatusUpdate: Joi.object({
        status: Joi.string().valid('online', 'offline', 'busy').required()
    }),
    
    adminResolveTicket: Joi.object({
        resolution_message: Joi.string().min(10).max(2000).required(),
        status: Joi.string().valid('resolved', 'closed').required()
    })
};

module.exports = {
    validate,
    schemas
};