# SMS Magic Link Setup and Testing

This document provides commands to verify and test the SMS magic link flow from Sigma.

## Overview

The SMS magic link flow is already implemented in the Lambda function. When a button in Sigma is clicked:
1. Sigma calls API Gateway endpoint: `POST /v1/auth/send-to-mobile`
2. API Gateway invokes the Lambda function
3. Lambda validates the email (same check as email magic link flow)
4. If valid, Lambda sends SMS via SNS with magic link
5. User clicks SMS link → opens mobile app → authenticated (same as email flow)

## Required Parameters

The endpoint expects:
- `email`: User's email address (validated against approved emails)
- `phoneNumber`: Phone number in E.164 format (e.g., `+14155551234`)
- `apiKey`: API key from Secrets Manager (for authentication)
- `dashboardId`: (Optional) Dashboard ID for deep linking
- `linkType`: (Optional) `'direct'` or `'universal'` (defaults to `'universal'`)

## AWS CLI Commands

### 1. Get Your API Gateway ID and Region

```bash
# Get API Gateway ID
API_ID=$(aws apigateway get-rest-apis --query "items[?name=='Mobile Auth API'].id" --output text)
AWS_REGION=$(aws configure get region || echo "us-west-2")
API_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/v1"

echo "API Gateway ID: $API_ID"
echo "API URL: $API_URL"
```

### 2. Verify API Gateway Endpoint Exists

```bash
# List all resources in the API
aws apigateway get-resources --rest-api-id $API_ID

# Check specifically for send-to-mobile endpoint
aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query "items[?pathPart=='send-to-mobile']" \
  --output json
```

### 3. Get API Key from Secrets Manager

```bash
# Get the API key (needed for testing)
aws secretsmanager get-secret-value \
  --secret-id mobile-app/api-key \
  --query SecretString \
  --output text
```

Save this value - you'll need it for testing.

### 4. Test SMS Magic Link Endpoint

```bash
# Set your variables
API_KEY="YOUR-API-KEY-FROM-STEP-3"
TEST_EMAIL="test@sigmacomputing.com"  # Use an approved email
TEST_PHONE="+14155551234"  # Use E.164 format

# Test the endpoint
curl -X POST ${API_URL}/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"phoneNumber\": \"${TEST_PHONE}\",
    \"apiKey\": \"${API_KEY}\"
  }" | jq
```

**Expected Success Response:**
```json
{
  "success": true,
  "message": "Magic link sent via SMS",
  "expiresIn": 900
}
```

**Expected Error (Invalid Email):**
```json
{
  "error": "Email not approved",
  "message": "This email is not approved for access. Please contact your administrator."
}
```

### 5. Test with Invalid Email (Should Return Error)

```bash
# Test with unapproved email
curl -X POST ${API_URL}/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"invalid@example.com\",
    \"phoneNumber\": \"${TEST_PHONE}\",
    \"apiKey\": \"${API_KEY}\"
  }" | jq
```

### 6. Test with Invalid API Key (Should Return 401)

```bash
curl -X POST ${API_URL}/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"phoneNumber\": \"${TEST_PHONE}\",
    \"apiKey\": \"wrong-key\"
  }" | jq
```

### 7. Check Lambda Logs

```bash
# View recent logs
aws logs tail /aws/lambda/mobile-auth-handler --since 10m

# Follow logs in real-time
aws logs tail /aws/lambda/mobile-auth-handler --follow
```

### 8. Verify Lambda Has SNS Permissions

```bash
# Check Lambda execution role
LAMBDA_ROLE=$(aws lambda get-function \
  --function-name mobile-auth-handler \
  --query 'Configuration.Role' \
  --output text)

echo "Lambda Role: $LAMBDA_ROLE"

# Get role name from ARN
ROLE_NAME=$(echo $LAMBDA_ROLE | awk -F'/' '{print $NF}')

# Check attached policies
aws iam list-attached-role-policies --role-name $ROLE_NAME

# Check if SNS publish permission exists
aws iam get-role-policy \
  --role-name $ROLE_NAME \
  --policy-name <policy-name> 2>/dev/null || echo "Check inline policies"
```

### 9. Test SMS Sending (Verify SNS Configuration)

```bash
# Check if SNS topic exists (if using topics)
aws sns list-topics

# Note: The Lambda uses direct phone number publishing, so no topic is needed
# But verify the Lambda role has sns:Publish permission
```

### 10. Verify DynamoDB Token Storage

```bash
# Check if token was created (after successful SMS send)
aws dynamodb scan \
  --table-name mobile-auth-tokens \
  --filter-expression "tokenType = :type AND #source = :source" \
  --expression-attribute-names '{"#source": "metadata.sourceFlow"}' \
  --expression-attribute-values '{":type": {"S": "magic_link"}, ":source": {"S": "sms"}}' \
  --max-items 5 \
  --output json | jq
```

## Setting Up the Button in Sigma

In your Sigma dashboard/workbook, create a button that calls the API Gateway endpoint. The button should:

1. **Collect user input:**
   - Phone number (text input)
   - Email (can be pre-filled from Sigma user context)

2. **Make API call:**
   ```javascript
   // Example JavaScript for Sigma button
   fetch('https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/send-to-mobile', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       email: userEmail,  // From Sigma user context
       phoneNumber: phoneInput,  // From user input
       apiKey: 'YOUR-API-KEY'  // Store securely in Sigma
     })
   })
   .then(response => response.json())
   .then(data => {
     if (data.success) {
       alert('Magic link sent to your phone!');
     } else {
       alert('Error: ' + (data.message || data.error));
     }
   })
   .catch(error => {
     console.error('Error:', error);
     alert('Failed to send magic link');
   });
   ```

## Troubleshooting

### Issue: 401 Unauthorized
- **Cause:** Invalid or missing API key
- **Solution:** Verify API key in Secrets Manager matches what's being sent

### Issue: 403 Forbidden - Email not approved
- **Cause:** Email not in approved list or not @sigmacomputing.com
- **Solution:** Add email to `mobile-approved-emails` DynamoDB table or use @sigmacomputing.com email

### Issue: SMS not received
- **Check:** Lambda logs for SNS errors
- **Verify:** Lambda role has `sns:Publish` permission
- **Verify:** Phone number is in E.164 format (+country code)
- **Check:** AWS SNS service limits and account status

### Issue: CORS errors
- **Cause:** API Gateway CORS not configured
- **Solution:** The Lambda already returns CORS headers, but verify API Gateway OPTIONS method is set up

## Next Steps

1. Deploy the updated Lambda function (if you made changes)
2. Test the endpoint using the commands above
3. Configure the button in Sigma with the API endpoint URL
4. Test end-to-end: Button click → SMS received → Click link → App opens → User authenticated

## Notes

- The SMS magic link uses the same authentication flow as email magic links
- Tokens are stored in DynamoDB with `sourceFlow: 'sms'` in metadata
- Magic links expire in 15 minutes (900 seconds)
- The mobile app handles SMS magic links the same way as email magic links (via deep linking)

