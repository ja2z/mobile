# Comprehensive Testing Plan

Complete testing strategy for the mobile authentication system.

---

## Test Environment Setup

### Prerequisites

1. **AWS Resources Deployed**
   - DynamoDB tables created
   - Lambda function deployed
   - API Gateway configured
   - SES verified and out of sandbox
   - SNS enabled for SMS

2. **Test Accounts**
   - Test Sigma email: `test@sigmacomputing.com`
   - Test external email: `test@example.com` (add to approved list)
   - Test phone number: Your actual phone number

3. **Test Data**
   ```bash
   # Add test email to approved list
   aws dynamodb put-item \
     --table-name mobile-approved-emails \
     --item '{
       "email": {"S": "test@example.com"},
       "approvedBy": {"S": "admin@sigmacomputing.com"},
       "approvedAt": {"N": "'$(date +%s)'"},
       "metadata": {
         "M": {
           "company": {"S": "Test Company"},
           "reason": {"S": "Testing"}
         }
       }
     }'
   ```

---

## Test Suite 1: Email Magic Link Flow

### Test 1.1: Successful Email Flow (Sigma Email)

**Objective:** Verify that Sigma employees can request and use magic links

**Steps:**
1. Open mobile app
2. Enter email: `yourname@sigmacomputing.com`
3. Click "Send Magic Link"
4. Check email inbox
5. Click magic link in email
6. Verify app opens and authenticates

**Expected Results:**
- ✅ "Magic link sent" message appears
- ✅ Email received within 30 seconds
- ✅ Email contains clickable link
- ✅ Link opens mobile app
- ✅ User is authenticated and sees Home screen
- ✅ User email displayed on Home screen

**Test Data:**
```json
{
  "email": "test@sigmacomputing.com"
}
```

---

### Test 1.2: Successful Email Flow (Approved External Email)

**Objective:** Verify approved external users can authenticate

**Steps:**
1. Add `test@example.com` to approved emails table (see setup)
2. Open mobile app
3. Enter email: `test@example.com`
4. Click "Send Magic Link"
5. Check email inbox
6. Click magic link
7. Verify authentication

**Expected Results:**
- ✅ Same as Test 1.1

---

### Test 1.3: Rejected Email (Not Approved)

**Objective:** Verify unapproved emails are rejected

**Steps:**
1. Open mobile app
2. Enter email: `notapproved@randomdomain.com`
3. Click "Send Magic Link"

**Expected Results:**
- ✅ Error message appears
- ✅ Message says "Email not approved"
- ✅ User instructed to contact administrator
- ✅ No email sent

---

### Test 1.4: Invalid Email Format

**Objective:** Verify email validation

**Test Cases:**
```javascript
const invalidEmails = [
  'notanemail',
  '@sigmacomputing.com',
  'missing@',
  'spaces in@email.com',
  '',
  'email@',
  '@domain.com'
];
```

**Expected Results:**
- ✅ Error message: "Please enter a valid email address"
- ✅ No API call made
- ✅ Form stays on screen

---

### Test 1.5: Token Expiry

**Objective:** Verify magic link expires after 15 minutes

**Steps:**
1. Request magic link
2. Note the token from email: `bigbuys://auth?token=tok_ml_xxx`
3. Wait 16 minutes
4. Click the magic link

**Expected Results:**
- ✅ Error message: "Invalid or expired token"
- ✅ User remains on auth screen
- ✅ User can request new magic link

**Alternative Test (Faster):**
```bash
# Manually test with expired token via DynamoDB
# Update expiresAt to past time
aws dynamodb update-item \
  --table-name mobile-auth-tokens \
  --key '{"tokenId": {"S": "tok_ml_YOUR_TOKEN"}}' \
  --update-expression "SET expiresAt = :expiry" \
  --expression-attribute-values '{":expiry": {"N": "1000000000"}}'

# Then try to verify the token
```

---

### Test 1.6: Token Reuse (One-Time Use)

**Objective:** Verify tokens can only be used once

**Steps:**
1. Request magic link
2. Click magic link and authenticate
3. Copy the same magic link
4. Sign out from app
5. Try to use the same magic link again

**Expected Results:**
- ✅ First use: Success
- ✅ Second use: Error "Token already used"
- ✅ Must request new magic link

---

### Test 1.7: Concurrent Sessions

**Objective:** Verify user can have multiple active sessions

**Steps:**
1. Authenticate on iPhone
2. Without signing out, authenticate on iPad
3. Verify both devices work

**Expected Results:**
- ✅ Both devices remain authenticated
- ✅ Both can access dashboard
- ✅ Sessions are independent

---

## Test Suite 2: SMS Magic Link Flow

### Test 2.1: Successful SMS Flow from Desktop

**Objective:** Verify desktop-to-mobile handoff works

**Steps:**
1. Login to desktop Big Buys app
2. Click "Send to Mobile" button
3. Enter phone number: `+14155551234`
4. Click Send
5. Check phone for SMS
6. Click link in SMS
7. Verify mobile app opens and authenticates

**Expected Results:**
- ✅ Desktop shows success message
- ✅ SMS received within 30 seconds
- ✅ SMS contains clickable link
- ✅ Mobile app opens and authenticates
- ✅ User email from desktop session matches mobile

**Test Request:**
```bash
curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@sigmacomputing.com",
    "phoneNumber": "+14155551234",
    "apiKey": "YOUR-API-KEY"
  }'
```

---

### Test 2.2: SMS with Dashboard Deep Link

**Objective:** Verify deep linking to specific dashboard

**Steps:**
1. On desktop, open specific dashboard (note dashboardId)
2. Click "Send to Mobile"
3. Enter phone number
4. Click Send
5. Open SMS link on mobile
6. Verify app authenticates AND navigates to that dashboard

**Expected Results:**
- ✅ SMS contains `dashboardId` parameter
- ✅ Mobile app authenticates
- ✅ App automatically navigates to specified dashboard

**Test Request:**
```bash
curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@sigmacomputing.com",
    "phoneNumber": "+14155551234",
    "apiKey": "YOUR-API-KEY",
    "dashboardId": "workbook_sales_dashboard"
  }'
```

---

### Test 2.3: Invalid API Key

**Objective:** Verify API key validation

**Steps:**
1. Make send-to-mobile request with wrong API key

**Test Request:**
```bash
curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@sigmacomputing.com",
    "phoneNumber": "+14155551234",
    "apiKey": "wrong-api-key"
  }'
```

**Expected Results:**
- ✅ 401 Unauthorized response
- ✅ Error: "Invalid API key"
- ✅ No SMS sent

---

### Test 2.4: Invalid Phone Numbers

**Objective:** Verify phone number validation

**Test Cases:**
```javascript
const invalidPhoneNumbers = [
  '4155551234',        // Missing +1
  '+1 (415) 555-1234', // Formatted (not E.164)
  '14155551234',       // Missing +
  '+1415555123',       // Too short
  'notaphone',         // Not a number
  '+99999999999999999' // Too long
];
```

**Expected Results:**
- ✅ 400 Bad Request
- ✅ Error message explains E.164 format
- ✅ No SMS sent

---

## Test Suite 3: Token Refresh

### Test 3.1: Manual Token Refresh

**Objective:** Verify token refresh endpoint works

**Steps:**
1. Authenticate and get session token
2. Extract token from secure storage
3. Call refresh endpoint
4. Verify new token is returned

**Test Request:**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$TOKEN\"}"
```

**Expected Results:**
- ✅ New token returned
- ✅ New expiry date is ~30 days in future
- ✅ Old token still works until it expires

---

### Test 3.2: Auto-Refresh Before Expiry

**Objective:** Verify AuthService auto-refreshes tokens

**Steps:**
1. Authenticate
2. Manually set token expiry to 6 days from now in DynamoDB
3. Open app (triggers `getSession()`)
4. Verify token is auto-refreshed

**Alternative Test:**
```typescript
// Modify AuthService.ts temporarily for testing
// Change auto-refresh threshold from 7 days to 29 days
if (daysUntilExpiry < 29) { // Will always trigger refresh
  return await this.refreshToken();
}
```

**Expected Results:**
- ✅ Token is refreshed automatically
- ✅ User doesn't notice anything
- ✅ New token saved to secure storage

---

### Test 3.3: Refresh Expired Token

**Objective:** Verify refresh fails for expired token

**Steps:**
1. Get session token
2. Wait for token to expire (or modify DynamoDB)
3. Try to refresh expired token

**Expected Results:**
- ✅ 401 Unauthorized
- ✅ Error: "Invalid or expired token"
- ✅ User must re-authenticate

---

## Test Suite 4: Deep Link Handling

### Test 4.1: Deep Link While App is Closed

**Objective:** Verify deep links work when app is not running

**Steps:**
1. Force quit mobile app
2. Click magic link in email/SMS
3. Verify app opens and authenticates

**iOS Simulator Test:**
```bash
# App must be closed
xcrun simctl openurl booted "bigbuys://auth?token=tok_ml_YOUR_TOKEN"
```

**Expected Results:**
- ✅ App launches
- ✅ Authentication happens automatically
- ✅ User sees Home screen

---

### Test 4.2: Deep Link While App is in Background

**Objective:** Verify deep links work when app is backgrounded

**Steps:**
1. Open app and minimize it
2. Click magic link
3. Verify app comes to foreground and authenticates

**Expected Results:**
- ✅ App returns to foreground
- ✅ Authentication overlay appears briefly
- ✅ User authenticated successfully

---

### Test 4.3: Deep Link While Already Authenticated

**Objective:** Verify behavior when clicking magic link while logged in

**Steps:**
1. Authenticate in app
2. Click a different magic link
3. Observe behavior

**Expected Results:**
- ✅ Either: New authentication replaces old session
- ✅ Or: User shown message "Already authenticated"
- ✅ No crash or error

---

### Test 4.4: Invalid Deep Link Format

**Objective:** Verify handling of malformed deep links

**Test Cases:**
```bash
# Missing token
xcrun simctl openurl booted "bigbuys://auth"

# Wrong hostname
xcrun simctl openurl booted "bigbuys://wrong?token=tok_ml_123"

# Invalid token format
xcrun simctl openurl booted "bigbuys://auth?token=invalid"
```

**Expected Results:**
- ✅ App doesn't crash
- ✅ Error message shown to user
- ✅ User remains on current screen

---

## Test Suite 5: Session Management

### Test 5.1: Session Persistence Across App Restarts

**Objective:** Verify sessions survive app restarts

**Steps:**
1. Authenticate in app
2. Force quit app
3. Reopen app
4. Verify still authenticated

**Expected Results:**
- ✅ User remains logged in
- ✅ No re-authentication needed
- ✅ Dashboard accessible

---

### Test 5.2: Sign Out

**Objective:** Verify sign out clears session

**Steps:**
1. Authenticate
2. Navigate to Home screen
3. Click "Sign Out"
4. Confirm sign out
5. Verify session cleared

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ After confirmation, auth screen shown
- ✅ Token removed from secure storage
- ✅ Cannot access dashboard without re-auth

---

### Test 5.3: Expired Session Handling

**Objective:** Verify expired sessions handled gracefully

**Steps:**
1. Authenticate
2. Manually set token expiry to past (in DynamoDB or device)
3. Try to access dashboard

**Expected Results:**
- ✅ Session detected as expired
- ✅ User redirected to auth screen
- ✅ Clear message: "Session expired"
- ✅ Can re-authenticate successfully

---

## Test Suite 6: Error Scenarios

### Test 6.1: Network Offline During Auth

**Objective:** Verify offline error handling

**Steps:**
1. Enable airplane mode
2. Try to request magic link

**Expected Results:**
- ✅ Error message: "Network error"
- ✅ Suggestion to check connection
- ✅ Can retry when online

---

### Test 6.2: Lambda Timeout

**Objective:** Verify timeout handling

**Test:**
```bash
# Simulate by setting very short timeout in mobile app
# Or by making Lambda sleep
```

**Expected Results:**
- ✅ Timeout error shown
- ✅ User can retry
- ✅ No crash

---

### Test 6.3: SES/SNS Service Failure

**Objective:** Verify handling when AWS services fail

**Test:** Temporarily remove SES permissions from Lambda

**Expected Results:**
- ✅ Lambda returns error
- ✅ User sees friendly error message
- ✅ Can try again later

---

## Test Suite 7: Security Tests

### Test 7.1: JWT Tampering

**Objective:** Verify tampered JWTs are rejected

**Steps:**
1. Get valid JWT
2. Modify payload (change email)
3. Try to use modified JWT

**Expected Results:**
- ✅ JWT verification fails
- ✅ 401 Unauthorized
- ✅ Must re-authenticate

---

### Test 7.2: Token from Different Device

**Objective:** Verify device binding works

**Steps:**
1. Authenticate on Device A
2. Extract token
3. Try to use token on Device B

**Expected Results:**
- ✅ Token works (device binding is soft, not enforced)
- ✅ OR if enforced: Token rejected

**Note:** Current implementation doesn't strictly enforce device binding, but tracks it for audit purposes.

---

## Test Suite 8: Performance Tests

### Test 8.1: Magic Link Delivery Time

**Objective:** Measure time from request to delivery

**Method:**
1. Request magic link
2. Note timestamp
3. Check email/SMS
4. Note delivery timestamp

**Success Criteria:**
- ✅ Email: < 30 seconds
- ✅ SMS: < 30 seconds
- ✅ P95: < 60 seconds

---

### Test 8.2: Authentication Latency

**Objective:** Measure time from token verification to authenticated state

**Method:**
1. Click magic link
2. Measure time to Home screen

**Success Criteria:**
- ✅ < 2 seconds on good network
- ✅ < 5 seconds on slow network

---

## Test Suite 9: Integration Tests

### Test 9.1: Embed URL with User Context

**Objective:** Verify embed URLs include user context

**Steps:**
1. Authenticate as `test@sigmacomputing.com`
2. Open dashboard
3. Inspect embed URL request in network tab

**Expected Results:**
- ✅ Request includes email and userId
- ✅ Sigma embed URL personalized
- ✅ Dashboard loads successfully

---

## Automated Test Script

```bash
#!/bin/bash

# test-auth-flow.sh
# Automated test script for auth endpoints

API_URL="https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth"
TEST_EMAIL="test@sigmacomputing.com"
TEST_PHONE="+14155551234"
API_KEY="YOUR-API-KEY"

echo "🧪 Starting authentication tests..."

# Test 1: Request magic link
echo "\n📧 Test 1: Request magic link"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/request-magic-link" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ PASS: Magic link requested successfully"
else
  echo "❌ FAIL: Expected 200, got $HTTP_CODE"
fi

# Test 2: Request with invalid email
echo "\n📧 Test 2: Invalid email format"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/request-magic-link" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"notanemail\"}")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ PASS: Invalid email rejected"
else
  echo "❌ FAIL: Expected 400, got $HTTP_CODE"
fi

# Test 3: Send to mobile
echo "\n📱 Test 3: Send to mobile"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/send-to-mobile" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"phoneNumber\": \"$TEST_PHONE\",
    \"apiKey\": \"$API_KEY\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ PASS: SMS sent successfully"
else
  echo "❌ FAIL: Expected 200, got $HTTP_CODE"
fi

# Test 4: Invalid API key
echo "\n🔑 Test 4: Invalid API key"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/send-to-mobile" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"phoneNumber\": \"$TEST_PHONE\",
    \"apiKey\": \"wrong-key\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PASS: Invalid API key rejected"
else
  echo "❌ FAIL: Expected 401, got $HTTP_CODE"
fi

echo "\n✅ All automated tests complete!"
```

---

## Test Checklist

Before production deployment, verify all tests pass:

### Email Flow
- [ ] Sigma email can request and use magic link
- [ ] Approved external email can authenticate
- [ ] Unapproved email is rejected
- [ ] Invalid email format is rejected
- [ ] Magic link expires after 15 minutes
- [ ] Magic link is one-time use only

### SMS Flow
- [ ] SMS sent from desktop app
- [ ] SMS includes dashboard deep link
- [ ] Invalid API key rejected
- [ ] Invalid phone number rejected

### Session Management
- [ ] Token refresh works
- [ ] Auto-refresh before expiry
- [ ] Session persists across restarts
- [ ] Sign out clears session

### Deep Links
- [ ] Works when app closed
- [ ] Works when app backgrounded
- [ ] Invalid deep links handled gracefully

### Error Handling
- [ ] Network errors handled
- [ ] Service failures handled gracefully
- [ ] User-friendly error messages

### Security
- [ ] JWT tampering detected
- [ ] Expired tokens rejected

---

## Reporting Issues

When reporting test failures, include:
1. Test ID (e.g., "Test 1.5")
2. Steps to reproduce
3. Expected vs actual results
4. Screenshots or logs
5. Device/simulator info
6. Network conditions