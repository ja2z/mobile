# AWS Setup Guide for Mobile Authentication

Complete step-by-step guide to set up all AWS resources needed for the mobile app authentication system.

---

## Prerequisites

- AWS CLI installed and configured
- AWS account with appropriate permissions
- Node.js 18+ installed for Lambda deployment
- Domain verified in SES (for sending emails)

---

## Step 1: Create DynamoDB Tables

### Table 1: mobile-auth-tokens

```bash
aws dynamodb create-table \
  --table-name mobile-auth-tokens \
  --attribute-definitions \
    AttributeName=tokenId,AttributeType=S \
    AttributeName=email,AttributeType=S \
    AttributeName=createdAt,AttributeType=N \
    AttributeName=userId,AttributeType=S \
    AttributeName=tokenType,AttributeType=S \
  --key-schema \
    AttributeName=tokenId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "email-index",
        "KeySchema": [
          {"AttributeName": "email", "KeyType": "HASH"},
          {"AttributeName": "createdAt", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      },
      {
        "IndexName": "userId-tokenType-index",
        "KeySchema": [
          {"AttributeName": "userId", "KeyType": "HASH"},
          {"AttributeName": "tokenType", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      }
    ]' \
  --stream-specification \
    StreamEnabled=false
```

### Enable TTL on mobile-auth-tokens

```bash
aws dynamodb update-time-to-live \
  --table-name mobile-auth-tokens \
  --time-to-live-specification \
    "Enabled=true,AttributeName=expiresAt"
```

### Table 2: mobile-approved-emails

```bash
aws dynamodb create-table \
  --table-name mobile-approved-emails \
  --attribute-definitions \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=email,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### Add sample approved email (for testing)

```bash
aws dynamodb put-item \
  --table-name mobile-approved-emails \
  --item '{
    "email": {"S": "test@example.com"},
    "approvedBy": {"S": "admin@sigmacomputing.com"},
    "approvedAt": {"N": "'$(date +%s)'"},
    "metadata": {
      "M": {
        "company": {"S": "Test Company"},
        "reason": {"S": "Testing"},
        "notes": {"S": "Test user for development"}
      }
    }
  }'
```

---

## Step 2: Configure Secrets Manager

### Create JWT Secret

```bash
# Generate a random 256-bit secret
JWT_SECRET=$(openssl rand -base64 32)

# Store in Secrets Manager
aws secretsmanager create-secret \
  --name mobile-app/jwt-secret \
  --description "JWT signing secret for mobile app authentication" \
  --secret-string "$JWT_SECRET"
```

### Create API Key for Desktop Integration

```bash
# Generate a random API key
API_KEY=$(openssl rand -hex 32)

# Store in Secrets Manager
aws secretsmanager create-secret \
  --name mobile-app/api-key \
  --description "API key for desktop app to mobile app integration" \
  --secret-string "$API_KEY"

# Save this API key - you'll need it in your desktop app!
echo "Desktop API Key: $API_KEY"
```

---

## Step 3: Configure Amazon SES

### Verify Email Domain

```bash
# Verify your sending domain
aws ses verify-domain-identity \
  --domain sigmacomputing.com
```

**Important:** You'll receive a TXT record to add to your DNS. Add it and wait for verification.

### Verify Individual Email (for testing in sandbox)

```bash
# If SES is still in sandbox mode, verify your test email
aws ses verify-email-identity \
  --email-address noreply@sigmacomputing.com
```

### Move SES Out of Sandbox (Required for Production)

1. Go to AWS Console → SES → Account Dashboard
2. Click "Request production access"
3. Fill out the form explaining your use case
4. Wait for approval (usually 24-48 hours)

### Test SES Configuration

```bash
aws ses send-email \
  --from noreply@sigmacomputing.com \
  --to your-email@sigmacomputing.com \
  --subject "SES Test" \
  --text "SES is configured correctly!"
```

---

## Step 4: Configure Amazon SNS for SMS

### ⚠️ Important: Sender ID Required for U.S. SMS

**For sending SMS to U.S. phone numbers, AWS requires a verified sender ID:**
- **Toll-free number** (recommended for production) - you've requested this
- **10DLC (10-Digit Long Code)** - requires business registration
- **Short code** - typically for high-volume use cases

**While waiting for sender ID approval:**
- SNS will accept the `publish` command and return a MessageId
- Messages may not actually be delivered until sender ID is approved
- You can continue with other setup steps below
- Lambda code will work - SMS will just fail to deliver until sender ID is active

### Enable SMS in SNS

```bash
# Set default SMS type to Transactional (better delivery)
aws sns set-sms-attributes \
  --attributes DefaultSMSType=Transactional
```

### Set Spending Limit (Recommended)

```bash
# Set monthly SMS spending limit to $10 (prevents unexpected charges)
aws sns set-sms-attributes \
  --attributes MonthlySpendLimit=10
```

### Check SMS Attributes and Sandbox Status

```bash
# View current SMS configuration
aws sns get-sms-attributes

# Check if account is in SMS sandbox mode
# If in sandbox, you can only send to verified phone numbers
aws sns get-sms-sandbox-account-status
```

### Request Toll-Free Sender ID (If Not Already Done)

1. Go to AWS Console → SNS → Text messaging (SMS)
2. Click "Request origination identities" or "Request sender IDs"
3. Select "Toll-free number" and fill out the form
4. Approval typically takes 1-2 business days

### Test SMS Configuration (May Not Deliver Until Sender ID Approved)

```bash
# Test sending SMS (will return MessageId even if not delivered yet)
aws sns publish \
  --phone-number "+1YOUR-PHONE-NUMBER" \
  --message "SNS SMS is configured correctly!"

# You should see output like:
# {
#   "MessageId": "e9ec2a29-d159-5469-b661-4b5787786913"
# }
```

### Verify SMS Delivery Status

Even if SMS doesn't arrive, you can check if it was sent:

```bash
# Enable SMS delivery status logging to CloudWatch
aws sns set-sms-attributes \
  --attributes DeliveryStatusSuccessSamplingRate=100
```

Then check CloudWatch logs:
1. Go to AWS Console → CloudWatch → Log groups
2. Look for `/aws/sns/us-west-2/*/DirectPublishToPhoneNumber`
3. Check for delivery status: Success, Failure, or Unknown

**Note:** A successful `publish` response doesn't guarantee delivery. The message may be queued or blocked until sender ID is approved.

### ✅ Continue Setup While Waiting for Sender ID

**Good news:** You can continue with the remaining setup steps while waiting for sender ID approval:
- Step 5: IAM roles (no dependency on SMS)
- Step 6: Lambda deployment (will work - SMS just won't deliver yet)
- Step 7: API Gateway (no dependency on SMS)
- Step 8: Testing (you can test email flow, SMS will fail gracefully)

Once your toll-free sender ID is approved, SMS messages will start delivering automatically. The Lambda function will work correctly - it just won't be able to deliver SMS until the sender ID is active.

---

## Step 5: Create IAM Role for Lambda

### Create Trust Policy

Create file `lambda-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### Create Execution Policy

Create file `lambda-execution-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
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
        "arn:aws:dynamodb:*:*:table/mobile-auth-tokens/index/*",
        "arn:aws:dynamodb:*:*:table/mobile-approved-emails"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:mobile-app/jwt-secret-*",
        "arn:aws:secretsmanager:*:*:secret:mobile-app/api-key-*"
      ]
    }
  ]
}
```

### Create the Role

```bash
# Create IAM role
aws iam create-role \
  --role-name mobile-auth-lambda-role \
  --assume-role-policy-document file://lambda-trust-policy.json

# Attach execution policy
aws iam put-role-policy \
  --role-name mobile-auth-lambda-role \
  --policy-name mobile-auth-lambda-policy \
  --policy-document file://lambda-execution-policy.json
```

---

## Step 6: Deploy Lambda Function

### Prepare Lambda Package (Initial Setup)

If you're setting up Lambda from scratch:

```bash
# Navigate to your lambda directory (or create it)
cd /path/to/your/mobile/lambda

# Install dependencies (if not already done)
npm install

# Compile TypeScript
npm run build

# Package using npm script (recommended)
npm run package
# This will: build → copy dist/index.js to root → zip → clean up

# OR package manually:
# Clean old build artifacts first
rm -rf dist function.zip
npm run build
zip -r function.zip node_modules dist/
```

**Important:** Always clean the `dist` directory before rebuilding to ensure you get the latest compiled code. TypeScript's incremental compilation can sometimes miss changes.

### Update Lambda Code (For Subsequent Deployments)

When updating existing Lambda code, follow these steps carefully:

```bash
cd /path/to/your/mobile/lambda

# 1. CLEAN - Remove old build artifacts (critical!)
rm -rf dist function.zip

# 2. BUILD - Compile TypeScript to JavaScript
npm run build

# 3. VERIFY - Check that dist/index.js exists and has your latest changes
ls -lh dist/index.js
# Optionally verify specific code is present:
grep -i "your recent change" dist/index.js

# 4. PACKAGE - Create deployment zip
# Option A: Use npm script (recommended - handles copying and cleanup)
npm run package

# Option B: Manual zip with dist folder
zip -r function.zip node_modules dist/

# 5. VERIFY ZIP - Confirm your code is in the zip
unzip -l function.zip | grep -E "(dist/index.js|index.js)"
# Or extract and check:
mkdir -p /tmp/verify-zip && cd /tmp/verify-zip
unzip -q /path/to/lambda/function.zip
grep -i "your recent change" index.js 2>/dev/null || grep -i "your recent change" dist/index.js
cd /path/to/your/mobile/lambda

# 6. DEPLOY - Upload to Lambda
aws lambda update-function-code \
  --function-name mobile-auth-handler \
  --zip-file fileb://function.zip

# 7. VERIFY DEPLOYMENT - Check status and wait for completion
aws lambda get-function \
  --function-name mobile-auth-handler \
  --query 'Configuration.[LastModified,LastUpdateStatus,CodeSize]' \
  --output table

# Wait a few seconds if LastUpdateStatus is "InProgress"
sleep 3
```

**Quick Deploy Script (Recommended):**

Save this as a script or run it when updating Lambda:

```bash
#!/bin/bash
# Quick Lambda deployment script
# Usage: ./deploy-lambda.sh

cd "$(dirname "$0")" || exit 1

echo "🧹 Cleaning old build artifacts..."
rm -rf dist function.zip

echo "🔨 Building TypeScript..."
npm run build

echo "📦 Packaging Lambda..."
npm run package

echo "📤 Deploying to AWS Lambda..."
aws lambda update-function-code \
  --function-name mobile-auth-handler \
  --zip-file fileb://function.zip \
  --query '[CodeSha256,LastUpdateStatus]' \
  --output table

echo "✅ Deployment initiated! Check status with:"
echo "   aws lambda get-function --function-name mobile-auth-handler --query 'Configuration.LastUpdateStatus'"
```

Or as a one-liner:
```bash
cd /path/to/lambda && rm -rf dist function.zip && npm run build && npm run package && aws lambda update-function-code --function-name mobile-auth-handler --zip-file fileb://function.zip
```

**Common Issues and Solutions:**

- **Issue:** Changes not appearing in deployed Lambda
  - **Solution:** Always delete `dist/` before rebuilding. TypeScript incremental builds can cache old code.
  - **Quick fix:** Run `rm -rf dist && npm run build && npm run package` before deploying.
  
- **Issue:** Zip doesn't contain updated code
  - **Solution:** Verify the zip with `unzip -l function.zip | grep index.js` or extract and check the files directly.
  - **Quick fix:** Always run `rm -rf dist function.zip` first to ensure clean state.

- **Issue:** Lambda handler errors after deployment
  - **Solution:** Check that the handler path is correct (`index.handler` expects `index.js` at root, or adjust handler to `dist/index.handler` if using dist folder).
  - **Note:** The `npm run package` script copies `dist/index.js` to root as `index.js`, so handler should be `index.handler`.

### Create Lambda Function (Initial Setup Only)

```bash
# Get the IAM role ARN
ROLE_ARN=$(aws iam get-role --role-name mobile-auth-lambda-role --query 'Role.Arn' --output text)

# Create Lambda function
aws lambda create-function \
  --function-name mobile-auth-handler \
  --runtime nodejs18.x \
  --role $ROLE_ARN \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{
    TOKENS_TABLE=mobile-auth-tokens,
    APPROVED_EMAILS_TABLE=mobile-approved-emails,
    JWT_SECRET_NAME=mobile-app/jwt-secret,
    API_KEY_SECRET_NAME=mobile-app/api-key,
    FROM_EMAIL=noreply@sigmacomputing.com,
    APP_DEEP_LINK_SCHEME=bigbuys
  }"
```

### Test Lambda Function

```bash
# Test request-magic-link endpoint
# Note: Use /auth/... path (not /v1/auth/...) since API Gateway sends path without stage
aws lambda invoke \
  --function-name mobile-auth-handler \
  --cli-binary-format raw-in-base64-out \
  --payload '{
    "path": "/auth/request-magic-link",
    "httpMethod": "POST",
    "body": "{\"email\": \"test@sigmacomputing.com\"}"
  }' \
  response.json

cat response.json | jq

# Check logs to see path normalization in action
aws logs tail /aws/lambda/mobile-auth-handler --since 1m
```

**Note:** When testing Lambda directly (not via API Gateway), the path in the payload should match what API Gateway sends. Since resources are at `/auth/...` level and stage is `v1`, API Gateway sends `/auth/...` to Lambda (not `/v1/auth/...`). The Lambda code normalizes this internally.

---

## Step 7: Create API Gateway

### Create REST API

```bash
# Get AWS account ID and region (needed for ARNs)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-west-2")

# Create API
API_ID=$(aws apigateway create-rest-api \
  --name "Mobile Auth API" \
  --description "Authentication API for mobile app" \
  --endpoint-configuration types=REGIONAL \
  --query 'id' \
  --output text)

echo "API ID: $API_ID"
echo "AWS Account ID: $ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' \
  --output text)
```

### Create Resources and Methods

```bash
# Create /auth resource directly under root
# Note: Stage name "v1" will be prepended by API Gateway, so accessing via
# https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/v1/auth/... 
# will send /v1/auth/... to Lambda
AUTH_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part auth \
  --query 'id' \
  --output text)

# Create endpoint resources
for endpoint in request-magic-link send-to-mobile verify-magic-link refresh-token; do
  RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $AUTH_ID \
    --path-part $endpoint \
    --query 'id' \
    --output text)
  
  # Create POST method
  aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE
  
  # Integrate with Lambda
  LAMBDA_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:mobile-auth-handler"
  
  aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations"
  
  # Enable CORS
  aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --authorization-type NONE
  
  aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}'
done
```

### Deploy API

```bash
# Create deployment
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name v1

# Get the invoke URL
echo "API URL: https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/v1"
```

### Grant API Gateway Permission to Invoke Lambda

```bash
# Add permission
aws lambda add-permission \
  --function-name mobile-auth-handler \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
```

---

## Step 8: Test the Complete Flow

**Note:** If you're running these in a new terminal session, get your API ID and region first:

```bash
# Get your API ID (from Step 7 output, or query it here)
API_ID=$(aws apigateway get-rest-apis --query "items[?name=='Mobile Auth API'].id" --output text)
AWS_REGION=$(aws configure get region || echo "us-west-2")
API_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/v1"
echo "API URL: $API_URL"
```

### Test Email Magic Link

```bash
# Use the API_URL variable from above, or replace with your actual URL
curl -X POST ${API_URL}/auth/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@sigmacomputing.com"}'
```

### Test SMS Magic Link

```bash
# Get the API key you saved from Step 2
# Use the API_URL variable from above, or replace with your actual URL
curl -X POST ${API_URL}/auth/send-to-mobile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@sigmacomputing.com",
    "phoneNumber": "+14155551234",
    "apiKey": "YOUR-API-KEY-HERE"
  }'
```

---

## Step 9: Update Config in Mobile App

Update your `Config.ts` file with the API endpoint:

```typescript
export const Config = {
  API: {
    EMBED_URL_ENDPOINT: 'https://3x4hwcq05f.execute-api.us-west-2.amazonaws.com/v1/generateSigmaEmbedURL',
    AUTH_BASE_URL: 'https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth',
  },
  // ... rest of config
} as const;
```

---

## Monitoring and Logs

### View Lambda Logs

```bash
aws logs tail /aws/lambda/mobile-auth-handler --follow
```

### View API Gateway Logs

1. Go to AWS Console → API Gateway
2. Select your API → Stages → v1
3. Click "Logs/Tracing" tab
4. Enable CloudWatch logging

---

## Cost Estimation

For an internal demo tool with ~100 users:

- **DynamoDB:** ~$2/month (on-demand)
- **Lambda:** ~$0.50/month (free tier covers most usage)
- **API Gateway:** ~$1/month
- **SES:** $0 (first 1,000 emails free with EC2, or ~$0.10/1,000 emails)
- **SNS SMS:** ~$0.00645 per SMS in US (variable by country)
- **Secrets Manager:** $0.80/month (2 secrets)

**Total:** ~$5-10/month depending on SMS usage

---

## Security Checklist

- [ ] JWT secret is strong (32+ characters)
- [ ] API key is strong (32+ characters)
- [ ] SES is out of sandbox mode
- [ ] SNS spending limit is set
- [ ] IAM roles follow least privilege
- [ ] API Gateway has rate limiting enabled
- [ ] CloudWatch logs are enabled
- [ ] Secrets are in Secrets Manager (not environment variables)
- [ ] DynamoDB tables have backup enabled (optional)

---

## Troubleshooting

### Lambda Code Changes Not Appearing After Deployment

**Symptoms:**
- Lambda returns old behavior after updating code
- Logs don't show expected console.log statements
- Direct invocation shows old code running

**Solutions:**

1. **Always clean before rebuilding:**
   ```bash
   rm -rf dist function.zip
   npm run build
   ```

2. **Verify your code is in the zip:**
   ```bash
   # Check zip contents
   unzip -l function.zip | grep index.js
   
   # Extract and verify code is present
   mkdir -p /tmp/check && cd /tmp/check
   unzip -q /path/to/lambda/function.zip
   grep -i "your expected code" index.js || grep -i "your expected code" dist/index.js
   ```

3. **Check Lambda deployment status:**
   ```bash
   aws lambda get-function \
     --function-name mobile-auth-handler \
     --query 'Configuration.[LastUpdateStatus,LastModified,CodeSha256]' \
     --output table
   ```
   If `LastUpdateStatus` is `InProgress`, wait a few seconds and check again.

4. **Verify the deployed code:**
   ```bash
   # Test direct invocation with logging
   aws lambda invoke \
     --function-name mobile-auth-handler \
     --cli-binary-format raw-in-base64-out \
     --payload '{"path": "/auth/test", "httpMethod": "GET"}' \
     /tmp/test.json
   
   # Check logs immediately
   aws logs tail /aws/lambda/mobile-auth-handler --since 1m
   ```

5. **If using npm package script vs manual zip:**
   - `npm run package` creates zip with `index.js` at root (handler: `index.handler`)
   - Manual `zip -r function.zip node_modules dist/` creates zip with `dist/index.js` (handler: `dist/index.handler`)
   - Make sure your Lambda handler setting matches your zip structure!

### Emails not sending
- Check SES verification status
- Check SES sandbox mode
- Check Lambda logs for errors
- Verify FROM_EMAIL is verified in SES

### SMS not sending (MessageId returned but no message received)
**Most Common Cause: Missing or Unapproved Sender ID**
- ✅ Check: Sender ID approval status in SNS console
- ✅ Verify: Toll-free/10DLC number is approved and active
- ✅ Confirm: Phone number format is E.164 (+1XXXXXXXXXX for US)

**Other Potential Issues:**
- Check SNS spending limit hasn't been exceeded
- Verify recipient hasn't opted out (check SNS console)
- Check if account is in SMS sandbox mode (can only send to verified numbers)
- Review CloudWatch logs for delivery failure reasons
- Verify phone carrier accepts SMS from AWS (some carriers block initially)

**How to Check Delivery Status:**
```bash
# View recent SMS attributes including delivery stats
aws sns get-sms-attributes

# Check CloudWatch logs (if enabled)
aws logs tail /aws/sns/us-west-2/*/DirectPublishToPhoneNumber --follow
```

### Lambda timeout errors
- Increase Lambda timeout to 30 seconds
- Check DynamoDB table names are correct
- Verify IAM permissions

### Token verification fails
- Check JWT secret is correct
- Check token hasn't expired
- Verify token wasn't already used