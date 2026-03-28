# Security Configuration for Phone Validation Feature

## Authentication Model (JWT-only, as of 2026-03)

Both `/v1/phone/validate` and `/v1/phone/verify` endpoints now require a **Bearer session JWT** issued
by the magic-link authentication flow.

- **Removed**: `X-API-Key` header validation
- **Removed**: `emailhash` body field validation (SHA256 of API key + email)
- **Replaced with**: `Authorization: Bearer <sessionJWT>` header

The caller's identity (email, userId) is extracted from the verified JWT payload. This ensures
phone verification can only be performed by users who have already authenticated via their email address.

### JWT Verification

The JWT is verified using the `mobile-app/jwt-secret` Secrets Manager secret via the shared
`lambdas/shared/session-jwt.ts` module (native `crypto.createHmac` — no external dependencies).

The Lambda IAM policy grants `secretsmanager:GetSecretValue` for both:
- `mobile-app/telnyx-api-key*` (send SMS)
- `mobile-app/jwt-secret*` (verify session JWT)

## AWS Permissions

### Lambda IAM Role
The Lambda execution role (`mobile-phone-validation-lambda-role`) is configured with:

✅ **DynamoDB Permissions**:
- `GetItem`, `PutItem`, `UpdateItem`, `Query` on:
  - `mobile-phone-verifications` table and indexes

✅ **Secrets Manager Permissions**:
- `GetSecretValue` on:
  - `mobile-app/telnyx-api-key*` (for SMS sending)
  - `mobile-app/jwt-secret*` (for session JWT verification)

✅ **CloudWatch Logs**:
- Automatic via `AWSLambdaBasicExecutionRole` policy

### API Gateway → Lambda Permissions
✅ **Lambda Resource Policy**:
- API Gateway has permission to invoke `phone-validation-handler` Lambda
- Configured via `setup-api-gateway.sh`
- Source ARN: `arn:aws:execute-api:us-west-2:*:qx7x0uioo1/*/*`

## Rate Limiting

The phone validation endpoints have **strict rate limits** to prevent SMS abuse:

- **Rate Limit**: 5 requests per second
- **Burst Limit**: 10 requests

These limits are stricter than general endpoints (200 req/sec) because:
1. **Cost Control**: Each `/phone/validate` request sends an SMS via Telnyx (costs money)
2. **Spam Prevention**: Prevents abuse of SMS sending functionality
3. **Security**: Limits brute force attempts on verification codes

## Security Measures

### 1. JWT Authentication (primary)
- All requests require `Authorization: Bearer <sessionJWT>` header
- JWT is verified using HS256 with `mobile-app/jwt-secret`
- Expiration is checked; expired tokens return 401
- Returns 401 if missing or invalid

### 2. User Must Already Exist (verify endpoint)
- `/v1/phone/verify` checks that the user account exists in Postgres
- Returns 403 if user is not found — phone verification cannot create accounts
- Account creation only happens via the magic-link email flow

### 3. Verification Code Expiration
- Codes expire after 5 minutes (DynamoDB TTL)
- One-time use (marked as `used` after verification)
- Prevents code reuse attacks

### 4. Phone Number Validation
- Validates phone number format (E.164)
- Validated via Telnyx API (catches invalid numbers)
- Prevents sending SMS to invalid numbers

### 5. Error Handling
- Generic error messages to prevent information leakage
- Detailed errors logged server-side only
- Rate limit errors return 429 status code

## Monitoring

### CloudWatch Metrics
Monitor these metrics for security:
- `4XXError` - Invalid requests, expired codes, invalid JWTs
- `5XXError` - Server errors
- `ThrottleCount` - Rate limit hits
- `Count` - Request volume

### Cost Monitoring
Monitor Telnyx SMS costs:
- Each `/phone/validate` request sends one SMS
- Rate limits help control costs
- Consider setting up billing alerts
