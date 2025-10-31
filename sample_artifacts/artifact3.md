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

### Enable SMS in SNS

```bash
# Set default SMS type to Transactional (better delivery)
aws sns set-sms-attributes \
  --attributes DefaultSMSType=Transactional
```

### Set Spending Limit (Optional but Recommended)

```bash
# Set monthly SMS spending limit to $10
aws sns set-sms-attributes \
  --attributes MonthlySpendLimit=10
```

### Test SMS Configuration

```bash
aws sns publish \
  --phone-number "+1YOUR-PHONE-NUMBER" \
  --message "SNS SMS is configured correctly!"
```

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

### Prepare Lambda Package

```bash
# Create deployment directory
mkdir lambda-deploy
cd lambda-deploy

# Initialize npm project
npm init -y

# Install dependencies
npm install @aws-sdk/client-dynamodb \
            @aws-sdk/lib-dynamodb \
            @aws-sdk/client-ses \
            @aws-sdk/client-sns \
            @aws-sdk/client-secrets-manager \
            jsonwebtoken

# Copy your Lambda code
# (Copy the Lambda handler code from Artifact 2 into index.ts)

# Compile TypeScript (if using TypeScript)
npm install -D typescript @types/node @types/aws-lambda
npx tsc index.ts --target ES2020 --module commonjs --moduleResolution node

# Create deployment package
zip -r function.zip node_modules index.js
```

### Create Lambda Function

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
aws lambda invoke \
  --function-name mobile-auth-handler \
  --payload '{
    "path": "/v1/auth/request-magic-link",
    "httpMethod": "POST",
    "body": "{\"email\": \"test@sigmacomputing.com\"}"
  }' \
  response.json

cat response.json
```

---

## Step 7: Create API Gateway

### Create REST API

```bash
# Create API
API_ID=$(aws apigateway create-rest-api \
  --name "Mobile Auth API" \
  --description "Authentication API for mobile app" \
  --endpoint-configuration types=REGIONAL \
  --query 'id' \
  --output text)

echo "API ID: $API_ID"

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' \
  --output text)
```

### Create Resources and Methods

```bash
# Create /v1 resource
V1_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part v1 \
  --query 'id' \
  --output text)

# Create /v1/auth resource
AUTH_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $V1_ID \
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
  LAMBDA_ARN="arn:aws:lambda:us-west-2:YOUR-ACCOUNT-ID:function:mobile-auth-handler"
  
  aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:us-west-2:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations"
  
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
echo "API URL: https://$API_ID.execute-api.us-west-2.amazonaws.com/v1"
```

### Grant API Gateway Permission to Invoke Lambda

```bash
# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Add permission
aws lambda add-permission \
  --function-name mobile-auth-handler \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-west-2:$ACCOUNT_ID:$API_ID/*/*"
```

---

## Step 8: Test the Complete Flow

### Test Email Magic Link

```bash
curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@sigmacomputing.com"}'
```

### Test SMS Magic Link

```bash
# Get the API key you saved earlier
curl -X POST https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth/send-to-mobile \
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

### Emails not sending
- Check SES verification status
- Check SES sandbox mode
- Check Lambda logs for errors
- Verify FROM_EMAIL is verified in SES

### SMS not sending
- Check phone number format (E.164)
- Check SNS spending limit
- Check AWS account SMS capabilities
- Some countries require sender ID registration

### Lambda timeout errors
- Increase Lambda timeout to 30 seconds
- Check DynamoDB table names are correct
- Verify IAM permissions

### Token verification fails
- Check JWT secret is correct
- Check token hasn't expired
- Verify token wasn't already used