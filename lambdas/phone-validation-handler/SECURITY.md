# Security Configuration for Phone Validation Feature

## AWS Permissions

### Lambda IAM Role
The Lambda execution role (`mobile-phone-validation-lambda-role`) has been configured with:

✅ **DynamoDB Permissions**:
- `GetItem`, `PutItem`, `UpdateItem`, `Query` on:
  - `mobile-phone-verifications` table and indexes
  - `mobile-users` table and indexes
  - `mobile-approved-emails` table

✅ **Secrets Manager Permissions**:
- `GetSecretValue` on:
  - `mobile-app/api-key*` (for email hash validation)
  - `mobile-app/telnyx-api-key*` (for SMS sending)

✅ **CloudWatch Logs**:
- Automatic via `AWSLambdaBasicExecutionRole` policy

### API Gateway → Lambda Permissions
✅ **Lambda Resource Policy**:
- API Gateway has permission to invoke `phone-validation-handler` Lambda
- Configured via `lambda add-permission` in `setup-api-gateway.sh`
- Source ARN: `arn:aws:execute-api:us-west-2:*:qx7x0uioo1/*/*`

## Rate Limiting

### Current Configuration

The phone validation endpoints have **strict rate limits** to prevent SMS abuse:

- **Rate Limit**: 5 requests per second
- **Burst Limit**: 10 requests

These limits are stricter than general endpoints (200 req/sec) because:
1. **Cost Control**: Each `/phone/validate` request sends an SMS via Telnyx (costs money)
2. **Spam Prevention**: Prevents abuse of SMS sending functionality
3. **Security**: Limits brute force attempts on verification codes

### Configuration

Rate limits are configured via `scripts/set-api-gateway-rate-limits.sh`:

```bash
# Phone validation endpoints: Strict limits to prevent SMS abuse
PHONE_RATE_LIMIT=5         # requests per second
PHONE_BURST_LIMIT=10       # burst capacity
```

The script configures limits for:
- `/phone/validate/POST`
- `/phone/verify/POST`
- `/v1/phone/validate/POST`
- `/v1/phone/verify/POST`

### Applying Rate Limits

After deploying the phone validation endpoints, run:

```bash
./scripts/set-api-gateway-rate-limits.sh
```

This will apply the strict rate limits to the phone endpoints.

### Verifying Rate Limits

To verify rate limits are configured:

```bash
./scripts/verify-rate-limits.sh
```

Or manually check:

```bash
aws apigateway get-stage \
  --rest-api-id qx7x0uioo1 \
  --stage-name v1 \
  --region us-west-2 \
  --query 'methodSettings."/v1/phone/validate/POST".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
  --output json
```

## Additional Security Measures

### 1. API Key Header Validation
- All requests require `X-API-Key` header with valid API key
- Same API key as used in `/auth/send-to-mobile` endpoint
- Validates against `mobile-app/api-key` secret from Secrets Manager
- Returns 401 if missing or invalid

### 2. Email Hash Validation
- All requests require a valid email hash (`SHA256(apiKey + email)`)
- Provides additional layer of security beyond API key
- Prevents request tampering
- Same pattern as magic link flow

### 3. Verification Code Expiration
- Codes expire after 5 minutes (DynamoDB TTL)
- One-time use (marked as `used` after verification)
- Prevents code reuse attacks

### 4. Whitelist Validation
- Users must be whitelisted (or @sigmacomputing.com) before account creation
- Prevents unauthorized registration
- Checked at verification step, not code send step

### 5. Phone Number Validation
- Validates phone number format (E.164)
- Validates via Telnyx API (catches invalid numbers)
- Prevents sending SMS to invalid numbers

### 6. Error Handling
- Generic error messages to prevent information leakage
- Detailed errors logged server-side only
- Rate limit errors return 429 status code

## Monitoring

### CloudWatch Metrics
Monitor these metrics for security:
- `4XXError` - Invalid requests, expired codes
- `5XXError` - Server errors
- `ThrottleCount` - Rate limit hits
- `Count` - Request volume

### Cost Monitoring
Monitor Telnyx SMS costs:
- Each `/phone/validate` request sends one SMS
- Rate limits help control costs
- Consider setting up billing alerts

## Recommendations

1. **Monitor Rate Limit Hits**: If users frequently hit rate limits, consider:
   - Increasing limits slightly (but keep strict)
   - Adding per-IP rate limiting
   - Implementing exponential backoff in client

2. **Cost Alerts**: Set up AWS billing alerts for Telnyx costs

3. **Additional Rate Limiting**: Consider per-IP or per-email rate limiting for extra protection

4. **WAF Rules**: Consider AWS WAF rules for additional protection:
   - Geo-blocking if needed
   - IP reputation filtering
   - Custom rate limiting rules

