# Mobile Authentication API Reference

Complete API reference for all authentication endpoints.

**Base URL:** `https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth`

---

## Endpoints

### 1. Request Magic Link (Email Flow)

**Endpoint:** `POST /request-magic-link`

**Description:** Request a magic link via email for self-service registration/login.

#### Request

```http
POST /request-magic-link HTTP/1.1
Content-Type: application/json

{
  "email": "user@sigmacomputing.com"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email address |

#### Response (Success)

**Status Code:** 200

```json
{
  "success": true,
  "message": "Magic link sent to your email",
  "expiresIn": 900
}
```

#### Response (Error - Email Not Approved)

**Status Code:** 403

```json
{
  "error": "Email not approved",
  "message": "This email is not approved for access. Please contact your administrator."
}
```

#### Response (Error - Invalid Email)

**Status Code:** 400

```json
{
  "error": "Valid email is required"
}
```

#### curl Example

```bash
curl -X POST https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@sigmacomputing.com"}'
```

---

### 2. Send to Mobile (SMS Flow)

**Endpoint:** `POST /send-to-mobile`

**Description:** Send magic link via SMS for desktop-to-mobile handoff. Requires API key.

#### Request

```http
POST /send-to-mobile HTTP/1.1
Content-Type: application/json

{
  "email": "user@sigmacomputing.com",
  "phoneNumber": "+14155551234",
  "apiKey": "your-api-key-here",
  "dashboardId": "workbook_abc123"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email (already authenticated in desktop app) |
| phoneNumber | string | Yes | User's phone number in E.164 format |
| apiKey | string | Yes | Desktop app API key for authentication |
| dashboardId | string | No | Optional dashboard ID for deep linking |

#### Response (Success)

**Status Code:** 200

```json
{
  "success": true,
  "message": "Magic link sent via SMS",
  "expiresIn": 900
}
```

#### Response (Error - Invalid API Key)

**Status Code:** 401

```json
{
  "error": "Invalid API key"
}
```

#### Response (Error - Invalid Phone Number)

**Status Code:** 400

```json
{
  "error": "Invalid phone number format. Use E.164 format (e.g., +14155551234)"
}
```

#### curl Example

```bash
curl -X POST https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@sigmacomputing.com",
    "phoneNumber": "+14155551234",
    "apiKey": "sk_live_abc123xyz456",
    "dashboardId": "workbook_sales_dashboard"
  }'
```

---

### 3. Verify Magic Link

**Endpoint:** `POST /verify-magic-link`

**Description:** Verify magic link token and issue long-lived session JWT.

#### Request

```http
POST /verify-magic-link HTTP/1.1
Content-Type: application/json

{
  "token": "tok_ml_abc123xyz789",
  "deviceId": "dev_iphone_xyz123"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Magic link token from deep link URL |
| deviceId | string | Yes | Unique device identifier |

#### Response (Success)

**Status Code:** 200

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1701357432,
  "user": {
    "userId": "usr_abc123",
    "email": "demo@sigmacomputing.com"
  },
  "dashboardId": "workbook_sales_dashboard"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always true on success |
| token | string | JWT session token (valid for 30 days) |
| expiresAt | number | Unix timestamp when token expires |
| user | object | User information |
| user.userId | string | Unique user identifier |
| user.email | string | User's email address |
| dashboardId | string \| null | Dashboard ID if provided in SMS flow |

#### Response (Error - Invalid Token)

**Status Code:** 404

```json
{
  "error": "Invalid or expired token"
}
```

#### Response (Error - Token Already Used)

**Status Code:** 400

```json
{
  "error": "Token already used"
}
```

#### curl Example

```bash
curl -X POST https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth/verify-magic-link \
  -H "Content-Type: application/json" \
  -d '{
    "token": "tok_ml_abc123xyz789",
    "deviceId": "dev_iphone_xyz123"
  }'
```

---

### 4. Refresh Token

**Endpoint:** `POST /refresh-token`

**Description:** Refresh session token before expiry.

#### Request

```http
POST /refresh-token HTTP/1.1
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Current session JWT |

#### Response (Success - Token Refreshed)

**Status Code:** 200

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1703949432
}
```

#### Response (Success - No Refresh Needed)

**Status Code:** 200

```json
{
  "success": true,
  "message": "Token still valid, no refresh needed",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1703949432
}
```

#### Response (Error - Invalid Token)

**Status Code:** 401

```json
{
  "error": "Invalid or expired token"
}
```

#### curl Example

```bash
curl -X POST https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

## JWT Token Structure

The session JWT contains the following claims:

```json
{
  "userId": "usr_abc123",
  "email": "demo@sigmacomputing.com",
  "deviceId": "dev_iphone_xyz123",
  "iat": 1698765432,
  "exp": 1701357432
}
```

### JWT Claims

| Claim | Type | Description |
|-------|------|-------------|
| userId | string | Unique user identifier |
| email | string | User's email address |
| deviceId | string | Device identifier for session binding |
| iat | number | Issued at (Unix timestamp) |
| exp | number | Expires at (Unix timestamp) |

---

## Deep Link Format

Magic links use the following URL scheme:

### Email Flow
```
bigbuys://auth?token=tok_ml_abc123xyz789
```

### SMS Flow (with dashboard deep link)
```
bigbuys://auth?token=tok_ml_abc123xyz789&dashboardId=workbook_sales_dashboard
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Magic link token |
| dashboardId | string | No | Dashboard ID for direct navigation |

---

## Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Invalid or missing API key/token |
| 403 | Forbidden | Email not approved for access |
| 404 | Not Found | Token not found or endpoint doesn't exist |
| 500 | Internal Server Error | Server-side error |

---

## Rate Limiting

Currently no rate limiting is enforced, but recommendations:

- **Email requests:** Max 5 per email per hour
- **SMS requests:** Max 3 per phone number per hour
- **Token verification:** Max 10 attempts per token

---

## Security Best Practices

### For API Consumers

1. **Never hardcode API keys** - Store in environment variables or secure secrets
2. **Use HTTPS only** - All API calls must use HTTPS
3. **Validate tokens server-side** - Don't trust client-provided JWTs without verification
4. **Implement timeout handling** - Magic links expire in 15 minutes
5. **Store JWTs securely** - Use platform secure storage (Keychain, SecureStore)

### Token Lifetimes

| Token Type | Lifetime | One-time Use |
|------------|----------|--------------|
| Magic Link | 15 minutes | Yes |
| Session JWT | 30 days | No (reusable) |

---

## Example Integration Flows

### Email Magic Link Flow

```javascript
// 1. User enters email
const response = await fetch(`${API_URL}/request-magic-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@sigmacomputing.com' })
});

// 2. User receives email, clicks link: bigbuys://auth?token=tok_ml_xxx

// 3. App handles deep link and verifies token
const verifyResponse = await fetch(`${API_URL}/verify-magic-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'tok_ml_xxx',
    deviceId: 'dev_iphone_123'
  })
});

const { token, user } = await verifyResponse.json();

// 4. Store session token securely
await SecureStore.setItemAsync('session_token', token);
```

### SMS Magic Link Flow (Desktop Integration)

```javascript
// Desktop app backend calls Lambda
const response = await fetch(`${API_URL}/send-to-mobile`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@sigmacomputing.com',
    phoneNumber: '+14155551234',
    apiKey: process.env.MOBILE_API_KEY,
    dashboardId: 'workbook_sales_dashboard'
  })
});

// User receives SMS: bigbuys://auth?token=tok_ml_xxx&dashboardId=workbook_sales_dashboard
// Mobile app handles deep link (same as email flow)
```

### Token Refresh Flow

```javascript
// Check if token is close to expiry
const decoded = jwt.decode(sessionToken);
const daysUntilExpiry = (decoded.exp - Date.now() / 1000) / 86400;

if (daysUntilExpiry < 7) {
  // Refresh token
  const response = await fetch(`${API_URL}/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sessionToken })
  });

  const { token: newToken } = await response.json();
  await SecureStore.setItemAsync('session_token', newToken);
}
```

---

## Testing Endpoints

### Using curl

```bash
# Set variables
API_URL="https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth"
EMAIL="test@sigmacomputing.com"
API_KEY="your-api-key-here"

# Test email flow
curl -X POST "$API_URL/request-magic-link" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}"

# Test SMS flow
curl -X POST "$API_URL/send-to-mobile" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"phoneNumber\": \"+14155551234\",
    \"apiKey\": \"$API_KEY\"
  }"

# Test token verification (use actual token from email/SMS)
curl -X POST "$API_URL/verify-magic-link" \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"tok_ml_abc123\",
    \"deviceId\": \"dev_test_123\"
  }"
```

### Using Postman

Import this collection:

```json
{
  "info": {
    "name": "Mobile Auth API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Request Magic Link",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/request-magic-link",
        "body": {
          "mode": "raw",
          "raw": "{\"email\": \"{{testEmail}}\"}"
        }
      }
    },
    {
      "name": "Send to Mobile",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/send-to-mobile",
        "body": {
          "mode": "raw",
          "raw": "{\"email\": \"{{testEmail}}\", \"phoneNumber\": \"{{testPhone}}\", \"apiKey\": \"{{apiKey}}\"}"
        }
      }
    }
  ]
}
```

---

## Support

For API issues, check:
1. CloudWatch Logs: `/aws/lambda/mobile-auth-handler`
2. API Gateway logs in AWS Console
3. DynamoDB tables for stored tokens