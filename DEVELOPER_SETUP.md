# 🚀 RideFast Developer Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Validate API Documentation
```bash
npm run validate-swagger
```

### 3. Start All Services
```bash
npm run dev
```

### 4. Access Documentation
```bash
# Open in browser
open http://localhost/api-docs

# Or use the shortcut
npm run docs
```

## 📚 API Documentation Access

### Main Documentation Hub
- **URL**: `http://localhost/api-docs`
- **Features**: Interactive Swagger UI with all microservice APIs
- **Authentication**: Built-in JWT token testing
- **Try It Out**: Test endpoints directly from the browser

### Landing Page
- **URL**: `http://localhost/`
- **Features**: Service overview and quick links

## 🔧 Development Workflow

### Adding New API Endpoints

1. **Implement in Microservice**
   ```bash
   # Example: Adding to support-service
   cd packages/support-service
   # Add your route and controller
   ```

2. **Update Swagger Documentation**
   ```javascript
   // Edit swagger.js
   '/your-service/new-endpoint': {
     post: {
       tags: ['Your Service'],
       summary: 'Description of endpoint',
       // ... rest of OpenAPI spec
     }
   }
   ```

3. **Validate Documentation**
   ```bash
   npm run validate-swagger
   ```

4. **Test in Swagger UI**
   - Start services: `npm run dev`
   - Open: `http://localhost/api-docs`
   - Test your new endpoint

### Service-Specific Development

```bash
# Start individual services
npm run start:user-service      # Port 3001
npm run start:driver-service    # Port 3002  
npm run start:support-service   # Port 3003
npm run start:admin-service     # Port 3004
npm run start:signaling-service # Port 3005
```

## 📖 Documentation Structure

### Swagger Configuration (`swagger.js`)
- **OpenAPI 3.0** specification
- **All microservices** documented in one place
- **Security schemes** for JWT authentication
- **Reusable schemas** for common data models
- **Tagged endpoints** by service

### Service Categories
- 🔐 **User Service**: Authentication & profiles
- 🚗 **Driver Service**: Driver onboarding & documents
- 🎫 **Support Service**: Ticket management & agent ops
- 🛠️ **Admin Service**: Administrative operations
- 🔄 **Signaling Service**: Real-time WebSocket communication

## 🧪 Testing APIs

### Using Swagger UI (Recommended)
1. Navigate to `http://localhost/api-docs`
2. Click **"Authorize"** button
3. Enter JWT token: `Bearer your-token-here`
4. Click **"Try it out"** on any endpoint
5. Fill parameters and click **"Execute"**

### Using cURL
```bash
# Get JWT token first
curl -X POST "http://localhost/user-service/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919876543210", "otp": "123456"}'

# Use token in subsequent requests
curl -X GET "http://localhost/support-service/tickets" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Using Postman
1. Import OpenAPI spec from `http://localhost/api-docs`
2. Set up environment variables:
   - `baseUrl`: `http://localhost`
   - `token`: `your-jwt-token`
3. Use `{{baseUrl}}` and `{{token}}` in requests

## 🔍 Debugging & Monitoring

### Service Health Checks
```bash
# Check all services
curl http://localhost/

# Individual service health
curl http://localhost/user-service/
curl http://localhost/admin-service/health
curl http://localhost/signaling-service/
```

### Logs & Monitoring
```bash
# View all service logs (if using PM2)
pm2 logs

# View specific service logs
pm2 logs user-service
pm2 logs support-service

# Monitor in real-time
pm2 monit
```

### Port Usage
```bash
# Check which ports are in use
netstat -tulpn | grep :300

# Check specific port
lsof -i :3003
```

## 🔒 Authentication Flow

### For Support Agents
1. **Get Token**: Use existing JWT from user authentication
2. **Agent Role**: Ensure user has `support` role in `platform_staff` table
3. **City Access**: Agent can only access tickets from their assigned city

### For Admins
1. **City Admin**: Can manage agents and tickets in their city
2. **Central Admin**: Full system access across all cities

### Example Authentication
```javascript
// Headers for all authenticated requests
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "Content-Type": "application/json"
}
```

## 📊 API Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    "tickets": [...],
    "agents": [...]
  }
}
```

### Error Response
```json
{
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Validation failed",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## 🚀 Deployment

### Development
```bash
npm run dev  # All services with hot reload
```

### Production
```bash
pm2 start ecosystem.config.js
```

### Documentation Deployment
- Swagger UI is automatically available at `/api-docs`
- No separate deployment needed
- Updates automatically when you restart services

## 💡 Tips & Best Practices

### Documentation
- Always update `swagger.js` when adding new endpoints
- Use descriptive summaries and examples
- Include all possible response codes
- Add request/response examples

### Testing
- Test endpoints in Swagger UI before committing
- Verify authentication works correctly
- Check error responses and validation
- Test with different user roles

### Security
- Never commit JWT secrets to version control
- Use environment variables for sensitive data
- Test role-based access control
- Validate all input parameters

## 🆘 Troubleshooting

### Common Issues

**Swagger UI not loading**
```bash
# Check if swagger dependencies are installed
npm install swagger-jsdoc swagger-ui-express

# Restart the API Gateway
npm run start
```

**Authentication errors**
```bash
# Verify JWT token format
# Should be: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Check token expiration
# Get a fresh token from auth endpoint
```

**Service not responding**
```bash
# Check if service is running
pm2 status

# Check service logs
pm2 logs service-name

# Restart specific service
pm2 restart service-name
```

### Getting Help
- Check the Swagger UI for endpoint details
- Review service logs for error messages
- Test endpoints individually to isolate issues
- Verify database connections and environment variables

## 📞 Support

For development questions:
1. Check this documentation first
2. Review the Swagger UI at `/api-docs`
3. Check service logs for errors
4. Create an issue in the repository
5. Contact the development team