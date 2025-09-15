const Joi = require('joi');

// Common sanitization
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
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
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

// Route-specific schemas
const routeSchemas = {
  userProfileUpdate: Joi.object({
    fullName: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    // Enforce yyyy-mm-dd; also ensure valid ISO date
    dob: Joi.string()
      .pattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
      .required()
      .messages({
        'string.pattern.base': 'dob must be in YYYY-MM-DD format',
      }),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').required(),
  }),

  authLogin: Joi.object({
    countryCode: Joi.string()
      .pattern(/^\+[1-9]\d{0,3}$/)
      .required()
      .messages({ 'string.pattern.base': 'countryCode must start with + and 1-4 digits' }),
    phoneNumber: Joi.string()
      .pattern(/^\d{10}$/)
      .required()
      .messages({ 'string.pattern.base': 'phoneNumber must be exactly 10 digits' }),
  }),

  authVerifyOtp: Joi.object({
    countryCode: Joi.string()
      .pattern(/^\+[1-9]\d{0,3}$/)
      .required()
      .messages({ 'string.pattern.base': 'countryCode must start with + and 1-4 digits' }),
    phoneNumber: Joi.string()
      .pattern(/^\d{10}$/)
      .required()
      .messages({ 'string.pattern.base': 'phoneNumber must be exactly 10 digits' }),
    otp: Joi.string()
      .pattern(/^\d{4}$/)
      .required()
      .messages({ 'string.pattern.base': 'otp must be exactly 4 digits' }),
  }),
};

const validateBody = (schemaName) => {
  return (req, res, next) => {
    const schema = routeSchemas[schemaName];
    if (!schema) {
      return res.status(500).json({ success: false, message: 'Validation schema not found' });
    }
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Request body validation failed',
        errors: error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        })),
      });
    }
    req.body = value;
    next();
  };
};

module.exports = {
  sanitizeInput,
  validateBody,
};


