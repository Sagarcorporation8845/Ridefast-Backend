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

// Validation schemas for ticket operations
const schemas = {
    createTicket: Joi.object({
        customerId: Joi.string().uuid().required(),
        subject: Joi.string().min(5).max(255).required(),
        description: Joi.string().min(10).max(2000).required(),
        priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
        type: Joi.string().valid('text', 'voice_call').default('text')
    }),

    updateTicketStatus: Joi.object({
        status: Joi.string().valid('open', 'in_progress', 'pending_customer', 'resolved', 'closed').required()
    }),

    addTicketMessage: Joi.object({
        message: Joi.string().min(1).max(2000).required(),
        isInternal: Joi.boolean().default(false),
        attachments: Joi.array().items(
            Joi.object({
                filename: Joi.string().required(),
                url: Joi.string().uri().required(),
                size: Joi.number().positive().optional(),
                type: Joi.string().optional()
            })
        ).optional()
    }),

    updateAgentStatus: Joi.object({
        status: Joi.string().valid('online', 'offline', 'busy').required()
    })
};

module.exports = {
    validate,
    schemas
};