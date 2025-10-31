# Security Considerations

Comprehensive security guide for the mobile authentication system.

---

## Overview

This document outlines security best practices, potential vulnerabilities, and mitigation strategies for the mobile authentication system.

**Security Model:** Pragmatic security for internal demo tool

- Not public-facing (internal Sigma employees + select customers)
- Moderate risk tolerance (demo data, not production customer data)
- Focus on practical security without over-engineering
- Defense in depth approach

---

## 1. JWT Security

### JWT Signing

**Current Implementation:**
- Algorithm: HS256 (HMAC with SHA-256)
- Secret: 256-bit random key stored in AWS Secrets Manager

**Best Practices:**

✅ **DO:**
- Use strong random secret (32+ characters, base64 encoded)
- Store secret in AWS Secrets Manager, never in code
- Rotate secret periodically (every 6-12 months)
- Use HS256 algorithm (sufficient for this use case)

❌ **DON'T:**
- Don't use weak secrets or predictable patterns
- Don't hardcode secret in environment variables
- Don't use "none" algorithm
- Don't expose secret in logs or error messages

### JWT Validation

**Validation Checklist:**
```typescript
// When verifying JWT:
const decoded = jwt.verify(token, secret, {
  algorithms: ['HS256'],  // ✅ Whitelist algorithms
  maxAge: '30d',          // ✅ Enforce expiry
});

// Check claims
if (!decoded.userId || !decoded.email) {
  throw new Error('Invalid token claims');
}

// Check expiry explicitly
if (Date.now() / 1000 > decoded.exp) {
  throw new Error('Token expired');
}
```

### Token Storage

**Mobile App:**
- ✅ Store in `expo-secure-store` (Keychain on iOS)
- ✅ Never store in AsyncStorage or other insecure storage
- ✅ Clear tokens on sign out

**Desktop App:**
- ✅ Only store API key server-side
- ❌ Never send API key to browser/frontend

### Recommendations

**Rotate JWT Secret:**
```bash
# Every 6 months, generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# Update in Secrets Manager
aws secretsmanager update-secret \
  --secret-id mobile-app/jwt-secret \
  --secret-string "$NEW_SECRET"

# Plan: Old tokens will continue working until expiry (30 days max)
# New tokens will use new secret
```

---

## 2. API Key Security

### API Key Management

**Current Implementation:**
- Desktop backend shares API key with Lambda
- API key stored in AWS Secrets Manager
- Used to authenticate send-to-mobile requests

**Best Practices:**

✅ **DO:**
- Generate strong API key (32+ hex characters)
- Store in AWS Secrets Manager
- Use server-side only (never in frontend)
- Rotate every 6-12 months
- Monitor usage in CloudWatch

❌ **DON'T:**
- Don't expose in frontend code or browser
- Don't commit to version control
- Don't share via insecure channels (email, Slack)
- Don't log full API key (mask in logs)

### API Key Rotation Strategy

**Zero-Downtime Rotation:**

1. **Generate new key:**
```bash
NEW_API_KEY=$(openssl rand -hex 32)
```

2. **Update Lambda to accept both keys temporarily:**
```javascript
// Lambda: Accept both old and new key for 7 days
const validApiKeys = [
  await getSecret('mobile-app/api-key'),      // Old key
  await getSecret('mobile-app/api-key-new')   // New key
];

if (!validApiKeys.includes(providedApiKey)) {
  return createResponse(401, { error: 'Invalid API key' });
}
```

3. **Update desktop app to use new key**

4. **Remove old key after 7 days**

### Rate Limiting by API Key

```javascript
// Track usage per API key
const apiKeyUsage = new Map();

function checkApiKeyRateLimit(apiKey) {
  const limit = 100; // requests per hour
  const window = 60 * 60 * 1000; // 1 hour
  
  const now = Date.now();
  const usage = apiKeyUsage.get(apiKey) || [];
  const recentUsage = usage.filter(t => now - t < window);
  
  if (recentUsage.length >= limit) {
    throw new Error('API key rate limit exceeded');
  }
  
  recentUsage.push(now);
  apiKeyUsage.set(apiKey, recentUsage);
}
```

---

## 3. Magic Link Security

### Token Generation

**Best Practices:**

✅ **DO:**
- Use cryptographically secure random bytes
- Generate unique tokens (include timestamp entropy)
- Store securely in DynamoDB
- Set short expiry (15 minutes)
- Mark as one-time use

```javascript
// Good: Secure random token
const tokenId = `tok_ml_${randomBytes(16).toString('hex')}`;

// Bad: Predictable tokens
const tokenId = `tok_${Date.now()}_${userId}`; // ❌ Predictable
```

### Token Lifetime

**Current Implementation:**
- Magic links: 15 minutes
- Session tokens: 30 days

**Considerations:**

| Token Type | Lifetime | Rationale |
|------------|----------|-----------|
| Magic Link | 15 min | Long enough for email/SMS delivery, short enough to limit exposure |
| Session JWT | 30 days | Balance between security and user convenience |

**Recommendations:**
- Magic links: 10-15 minutes is ideal
- Sessions: 7-30 days (adjust based on risk tolerance)
- Consider shorter sessions (7 days) for external customers

### One-Time Use Enforcement

**Critical Security Control:**

```javascript
// Atomically check and mark token as used
await docClient.send(new UpdateCommand({
  TableName: TOKENS_TABLE,
  Key: { tokenId: token },
  UpdateExpression: 'SET #used = :true, usedAt = :now',
  ConditionExpression: '#used = :false', // ⚠️ CRITICAL: Only if not used
  ExpressionAttributeNames: { '#used': 'used' },
  ExpressionAttributeValues: { 
    ':true': true, 
    ':false': false,
    ':now': Math.floor(Date.now() / 1000)
  }
}));
```

**Why This Matters:**
- Prevents replay attacks
- Limits impact if magic link is intercepted
- Protects against email forwarding

---

## 4. Email Security

### Email Content

**Best Practices:**

✅ **DO:**
- Use HTTPS URLs only
- Include clear expiry information
- Add company branding
- Use action-oriented button, not just text link
- Include "didn't request this?" message

❌ **DON'T:**
- Don't include sensitive user data in email
- Don't use shortened URLs (looks phishy)
- Don't send from generic Gmail/Yahoo addresses

### Email Spoofing Prevention

**SPF, DKIM, DMARC:**

```bash
# Check your domain's email authentication
dig TXT sigmacomputing.com | grep -E "spf|dkim|dmarc"
```

**Recommendations:**
1. Enable SPF record
2. Enable DKIM signing in SES
3. Set up DMARC policy

### SES Security

**Configuration:**
- ✅ Verify domain (not just individual emails)
- ✅ Enable DKIM signing
- ✅ Move out of SES sandbox
- ✅ Set up bounce and complaint handling
- ✅ Monitor sending reputation

**Rate Limits:**
```javascript
// Prevent email bombing
const emailRateLimiter = {
  perEmail: 5,      // Max 5 magic links per email per hour
  perIP: 20,        // Max 20 from same IP per hour
  global: 1000      // Max 1000 emails per hour globally
};
```

---

## 5. SMS Security

### Phone Number Validation

**Strict Validation:**

```javascript
// Enforce E.164 format
function validatePhoneNumber(phone) {
  // E.164: +[country code][subscriber number]
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  
  if (!e164Regex.test(phone)) {
    throw new Error('Invalid phone format. Use E.164: +14155551234');
  }
  
  // Additional checks
  if (phone.length > 16) {
    throw new Error('Phone number too long');
  }
  
  return true;
}
```

### SMS Cost Control

**Critical for Production:**

```javascript
// Set spending limits in SNS
const monthlyLimit = 100; // $100/month

// Monitor usage
function trackSMSCost(phoneNumber) {
  // US: ~$0.00645 per SMS
  // International: varies by country
  
  // Log and alert if approaching limit
}
```

**Best Practices:**
- ✅ Set SNS monthly spending limit
- ✅ Monitor costs in CloudWatch
- ✅ Alert when >80% of budget used
- ✅ Consider SMS-only for Sigma employees initially

### SMS Bombing Prevention

```javascript
// Prevent abuse
const smsLimits = {
  perPhone: 3,       // Max 3 SMS per phone per hour
  perUser: 5,        // Max 5 SMS per user per day
  perIP: 10          // Max 10 from same IP per hour
};
```

---

## 6. DynamoDB Security

### Access Control

**IAM Policy (Least Privilege):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/mobile-auth-tokens",
        "arn:aws:dynamodb:*:*:table/mobile-auth-tokens/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/mobile-approved-emails"
    }
  ]
}
```

**Note:** Lambda only needs read access to approved-emails.

### Data Encryption

**Current:**
- ✅ Encryption at rest (default DynamoDB encryption)
- ✅ Encryption in transit (HTTPS only)

**Optional Enhancement:**
```bash
# Enable AWS managed KMS key
aws dynamodb update-table \
  --table-name mobile-auth-tokens \
  --sse-specification Enabled=true,SSEType=KMS
```

### TTL for Automatic Cleanup

**Security Benefit:**
- Automatically removes expired tokens
- Reduces attack surface
- Complies with data minimization principles

```javascript
// Ensure TTL is enabled
expiresAt: Math.floor(Date.now() / 1000) + 900 // 15 minutes
```

---

## 7. API Gateway Security

### CORS Configuration

**Strict CORS Policy:**

```javascript
// Lambda responses include CORS headers
headers: {
  'Access-Control-Allow-Origin': 'https://your-domain.com', // ✅ Specific domain
  // NOT '*' for sensitive endpoints
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'false'
}
```

### Rate Limiting

**API Gateway Throttling:**

```bash
# Set throttle limits
aws apigateway update-stage \
  --rest-api-id YOUR-API-ID \
  --stage-name v1 \
  --patch-operations \
    op=replace,path=/throttle/rateLimit,value=100 \
    op=replace,path=/throttle/burstLimit,value=200
```

**Recommended Limits:**
- Rate: 100 requests/second
- Burst: 200 requests
- Per-endpoint quotas:
  - `request-magic-link`: 10/min per IP
  - `send-to-mobile`: 5/min per API key
  - `verify-magic-link`: 20/min per IP

### WAF (Optional Enhancement)

**AWS WAF Rules:**
```bash
# Protect against common attacks
# - SQL injection
# - XSS
# - Rate limiting by IP
# - Geographic restrictions (if needed)
```

---

## 8. Deep Link Security

### URL Scheme Security

**iOS Universal Links (Recommended):**

Instead of custom scheme `bigbuys://`, use universal links:
- `https://bigbuys.sigmacomputing.com/auth?token=xxx`

**Benefits:**
- ✅ HTTPS security
- ✅ Verified domain ownership
- ✅ Fallback to web if app not installed
- ✅ Better user experience

**Implementation:**
```json
// apple-app-site-association
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAM_ID.com.sigmacomputing.bigbuys",
      "paths": ["/auth*"]
    }]
  }
}
```

### Token Validation on Deep Links

**Always Validate:**
```typescript
// Never trust deep link parameters
function handleDeepLink(url: string) {
  const { token, dashboardId } = parseURL(url);
  
  // Validate token format
  if (!token || !token.startsWith('tok_ml_')) {
    throw new Error('Invalid token format');
  }
  
  // Validate dashboardId if present
  if (dashboardId && !isValidDashboardId(dashboardId)) {
    throw new Error('Invalid dashboard ID');
  }
  
  // Verify with backend
  await verifyMagicLink(token);
}
```

---

## 9. Session Management

### Session Binding

**Device Binding:**

Current implementation tracks `deviceId` but doesn't strictly enforce it.

**Enhancement Option:**
```javascript
// Enforce device binding
if (decoded.deviceId !== currentDeviceId) {
  throw new Error('Token used on different device');
}
```

**Trade-off:**
- ✅ More secure
- ❌ Less convenient (user can't move between devices)

**Recommendation:** Keep current soft binding for demo tool.

### Session Revocation

**Implement Logout:**

```javascript
// When user signs out, add token to revocation list
const revokedTokens = new Set();

function isTokenRevoked(tokenId) {
  return revokedTokens.has(tokenId);
}

// In token verification
if (isTokenRevoked(decoded.jti)) {
  throw new Error('Token revoked');
}
```

**DynamoDB Revocation Table:**
```javascript
{
  tokenId: "ses_abc123",
  revokedAt: 1698765432,
  reason: "user_logout",
  expiresAt: 1701357432  // TTL
}
```

---

## 10. Monitoring and Auditing

### Security Monitoring

**CloudWatch Alarms:**

```bash
# Alert on suspicious activity
# - High rate of failed authentication attempts
# - API key authentication failures
# - Unusual geographic patterns (if available)
# - Cost spikes (SMS/email)
```

**Key Metrics to Track:**
- Magic link requests per hour
- Failed verification attempts
- Token refresh rate
- SMS costs
- API key usage by source

### Audit Logging

**What to Log:**

```javascript
// Security-relevant events
{
  timestamp: "2024-01-15T10:30:00Z",
  eventType: "magic_link_sent",
  userId: "usr_abc123",
  email: "user@example.com",
  ip: "192.168.1.1",
  userAgent: "MobileDashboard/1.0",
  success: true
}

{
  timestamp: "2024-01-15T10:31:00Z",
  eventType: "magic_link_verified",
  tokenId: "tok_ml_xyz789",
  userId: "usr_abc123",
  deviceId: "dev_iphone_abc",
  ip: "192.168.1.1",
  success: true
}

{
  timestamp: "2024-01-15T10:35:00Z",
  eventType: "token_verification_failed",
  tokenId: "tok_ml_invalid",
  reason: "token_expired",
  ip: "192.168.1.1",
  success: false
}
```

**What NOT to Log:**
- ❌ Full API keys
- ❌ JWT tokens
- ❌ Secrets or passwords
- ❌ Full phone numbers (mask: +1415***1234)

### Security Incident Response

**If Compromised:**

1. **Rotate all secrets immediately:**
```bash
# Rotate JWT secret
NEW_SECRET=$(openssl rand -base64 32)
aws secretsmanager update-secret \
  --secret-id mobile-app/jwt-secret \
  --secret-string "$NEW_SECRET"

# Rotate API key
NEW_API_KEY=$(openssl rand -hex 32)
aws secretsmanager update-secret \
  --secret-id mobile-app/api-key \
  --secret-string "$NEW_API_KEY"
```

2. **Invalidate all active sessions:**
```bash
# Delete all session tokens from DynamoDB
aws dynamodb scan --table-name mobile-auth-tokens \
  --filter-expression "tokenType = :type" \
  --expression-attribute-values '{":type": {"S": "session"}}' \
  | jq -r '.Items[].tokenId.S' \
  | xargs -I {} aws dynamodb delete-item \
      --table-name mobile-auth-tokens \
      --key '{"tokenId": {"S": "{}"}}'
```

3. **Notify users:** All users must re-authenticate

4. **Review logs:** Investigate how compromise occurred

---

## 11. Compliance Considerations

### GDPR/Privacy

**Data Collected:**
- Email addresses
- Phone numbers (optional)
- Device IDs
- IP addresses (in logs)
- Usage timestamps

**Compliance Requirements:**
- ✅ Data minimization (only collect what's needed)
- ✅ Automatic deletion (TTL on expired tokens)
- ✅ User can request deletion
- ✅ Secure storage (encrypted at rest)

### Data Retention

**Policy:**
- Magic link tokens: 15 minutes (auto-deleted via TTL)
- Session tokens: 30 days (auto-deleted via TTL)
- CloudWatch logs: 90 days
- Audit logs: 1 year

---

## 12. Security Checklist

### Pre-Deployment

- [ ] JWT secret is strong (32+ characters)
- [ ] API key is strong (32+ characters)
- [ ] Secrets stored in AWS Secrets Manager
- [ ] SES out of sandbox mode
- [ ] SES DKIM enabled
- [ ] SNS spending limit set
- [ ] DynamoDB encryption enabled
- [ ] IAM roles follow least privilege
- [ ] API Gateway rate limiting enabled
- [ ] CloudWatch logs enabled
- [ ] Error messages don't leak secrets
- [ ] Phone numbers masked in logs

### Post-Deployment

- [ ] Monitor CloudWatch for anomalies
- [ ] Review logs weekly
- [ ] Rotate secrets every 6 months
- [ ] Test incident response procedure
- [ ] Keep dependencies updated
- [ ] Review access permissions quarterly

---

## 13. Known Limitations

### Current Security Limitations:

1. **No IP-based restrictions** - Accept requests from any IP
2. **No geographic restrictions** - Accept from any country
3. **Soft device binding** - Tokens work across devices
4. **No session revocation list** - Can't immediately invalidate tokens
5. **Limited rate limiting** - Basic implementation only

### Future Enhancements:

1. **IP allowlisting** for Sigma offices
2. **Geo-blocking** for high-risk countries
3. **Strict device binding** option
4. **Token revocation list** in DynamoDB
5. **AWS WAF integration**
6. **2FA option** for external users
7. **Biometric auth** on mobile

---

## 14. Security Contact

**Report Security Issues:**
- Email: security@sigmacomputing.com
- Slack: #security-incidents

**Never:**
- Post security issues in public channels
- Share credentials via Slack/email
- Commit secrets to Git

---

## Summary

**Security Posture:** Good for internal demo tool

**Strengths:**
- ✅ Strong encryption (JWT, HTTPS, DynamoDB)
- ✅ Secrets management (AWS Secrets Manager)
- ✅ Automatic token expiry (TTL)
- ✅ One-time use magic links
- ✅ Email approval system

**Areas for Improvement:**
- ⚠️ Add rate limiting per IP/user
- ⚠️ Implement session revocation
- ⚠️ Add security monitoring/alerts
- ⚠️ Consider universal links over custom scheme

**Risk Level:** Low-Medium (internal tool with limited external access)

**Recommendation:** Current implementation is appropriate for the use case. Implement monitoring and be prepared to add stricter controls if needed.