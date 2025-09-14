# RideFast API Documentation

## 📚 Centralized API Documentation

All RideFast microservice APIs are documented in one place using Swagger/OpenAPI 3.0 specification.

### 🌐 Access Documentation

**Development:**
```
http://localhost/api-docs
```

**Production:**
```
https://api.ridefast.com/api-docs
```

## 🏗️ Architecture Overview

RideFast uses a microservices architecture with an API Gateway that routes requests to individual services:

```
Client → API Gateway (Port 80) → Microservices (Ports 3001-3005)
```

## 🔗 Service Endpoints

### API Gateway Routes
All external requests go through the API Gateway with service prefixes:

| Service | Prefix | Internal Port | Description |
|---------|--------|---------------|-------------|
| **User Service** | `/user-service/*` | 3001 | Authentication, profiles, locations |
| **Driver Service** | `/driver-service/*` | 3002 | Driver onboarding, documents |
| **Support Service** | `/support-service/*` | 3003 | Ticket management, agent operations |
| **Admin Service** | `/admin-service/*` | 3004 | Administrative operations |
| **Signaling Service** | `/signaling-service/*` | 3005 | WebSocket real-time communication |

## 📋 API Categories

### 🔐 Authentication & Users
- **Send OTP**: `POST /user-service/auth/send-otp`
- **Verify OTP**: `POST /user-service/auth/verify-otp`
- **Get Profile**: `GET /user-service/profile`
- **Update Profile**: `PUT /user-service/profile`

### 🚗 Driver Management
- **Register Driver**: `POST /driver-service/onboarding/register`
- **Upload Documents**: `POST /driver-service/onboarding/documents`
- **Get Driver Profile**: `GET /driver-service/profile`

### 🎫 Support Tickets
- **Create Ticket**: `POST /support-service/tickets`
- **Get Agent Tickets**: `GET /support-service/tickets`
- **Get Ticket Details**: `GET /support-service/tickets/{id}`
- **Update Ticket Status**: `PUT /support-service/tickets/{id}/status`
- **Add Message**: `POST /support-service/tickets/{id}/messages`

### 👤 Agent Operations
- **Update Agent Status**: `POST /support-service/agent/status`
- **Get Agent Workload**: `GET /support-service/agent/workload`

### 🛠️ Admin Operations
- **Create Agent**: `POST /admin-service/admin/agents`
- **List Agents**: `GET /admin-service/admin/agents`
- **Update Agent Status**: `PUT /admin-service/admin/agents/{id}/status`
- **Get Reassignment Candidates**: `GET /admin-service/admin/tickets/reassign`
- **Reassign Ticket**: `POST /admin-service/admin/tickets/{id}/reassign`

### 🔄 Real-time Communication
- **WebSocket Health**: `GET /signaling-service/`
- **WebSocket Connection**: `ws://localhost/signaling-service/socket.io/`

## 🔑 Authentication

Most endpoints require JWT authentication:

```bash
Authorization: Bearer <your-jwt-token>
```

### Getting a Token
1. Send OTP: `POST /user-service/auth/send-otp`
2. Verify OTP: `POST /user-service/auth/verify-otp`
3. Use returned token in Authorization header

## 📊 Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data here
  }
}
```

### Error Response
```json
{
  "error": {
    "type": "ERROR_TYPE",
    "message": "Human readable error message",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "details": [
      {
        "field": "fieldName",
        "message": "Field specific error"
      }
    ]
  }
}
```

## 🧪 Testing APIs

### Using Swagger UI
1. Navigate to `/api-docs`
2. Click "Authorize" button
3. Enter your JWT token
4. Test endpoints directly in the browser

### Using cURL
```bash
# Get user profile
curl -X GET "http://localhost/user-service/profile" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create support ticket
curl -X POST "http://localhost/support-service/tickets" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "uuid-here",
    "subject": "Payment Issue",
    "description": "Unable to complete payment for ride",
    "priority": "high"
  }'
```

### Using Postman
1. Import the OpenAPI spec from `/api-docs`
2. Set up environment variables for base URL and token
3. Use collection runner for automated testing

## 🔒 Security

### Rate Limiting
- Admin Service: 100 requests per 15 minutes per IP
- Other services: Standard rate limiting applied

### CORS Policy
- Development: `http://localhost:3000`
- Production: Configured domains only

### Input Validation
- All endpoints use Joi schema validation
- SQL injection prevention with parameterized queries
- File upload restrictions and validation

## 🚀 Development Workflow

### Local Development
```bash
# Start all services
npm run dev

# Access documentation
open http://localhost/api-docs
```

### Adding New Endpoints
1. Implement endpoint in respective microservice
2. Add documentation to `swagger.js`
3. Test using Swagger UI
4. Update this README if needed

## 📈 Monitoring & Health Checks

### Service Health Endpoints
- API Gateway: `GET /`
- User Service: `GET /user-service/`
- Driver Service: `GET /driver-service/`
- Support Service: `GET /support-service/`
- Admin Service: `GET /admin-service/health`
- Signaling Service: `GET /signaling-service/`

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

## 🔄 WebSocket Events

### Agent Status Events
```javascript
// Agent goes online/offline
socket.emit('agent_status_update', {
  agentId: 'uuid',
  status: 'online'
});

// Listen for status changes
socket.on('agent_status_changed', (data) => {
  console.log('Agent status changed:', data);
});
```

### Ticket Assignment Events
```javascript
// New ticket assigned
socket.on('new_ticket_assignment', (data) => {
  console.log('New ticket assigned:', data.ticketId);
});

// City admin alerts
socket.on('admin_alert', (data) => {
  console.log('Admin alert:', data.message);
});
```

## 📝 Changelog

### Version 1.0.0
- Initial API documentation
- User Service endpoints
- Driver Service endpoints
- Support Service endpoints (NEW)
- Admin Service endpoints (NEW)
- Signaling Service endpoints (NEW)
- Centralized Swagger documentation

## 🤝 Contributing

When adding new endpoints:
1. Follow RESTful conventions
2. Add proper error handling
3. Include input validation
4. Update Swagger documentation
5. Add examples and descriptions
6. Test thoroughly before deployment

## 📞 Support

For API documentation issues or questions:
- Create an issue in the repository
- Contact the development team
- Check the Swagger UI for interactive testing