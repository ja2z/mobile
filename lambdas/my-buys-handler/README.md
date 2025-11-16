# My Buys Lambda Handler

Lambda function for handling My Buys applet CRUD operations.

## Setup

### 1. Create KMS Key

```bash
cd lambdas/my-buys-handler
./setup-kms-key.sh
```

This creates a KMS customer-managed key with alias `mobile-my-buys-secrets` for encrypting embed secrets.

### 2. Create DynamoDB Table

```bash
./setup-dynamodb.sh
```

This creates the `mobile-my-buys-applets` table with:
- Partition Key: `userId` (String)
- Sort Key: `appletId` (String)
- GSI: `userId-createdAt-index`

### 3. Create Lambda Function

```bash
# Install dependencies
npm install

# Build Lambda
npm run build

# Package Lambda
./build-lambda.sh

# Create Lambda function (first time only)
aws lambda create-function \
  --function-name my-buys-handler \
  --runtime nodejs20.x \
  --role arn:aws:iam::763903610969:role/mobile-my-buys-lambda-role \
  --handler index.handler \
  --zip-file fileb://my-buys-handler.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{
    MY_BUYS_TABLE=mobile-my-buys-applets,
    KMS_KEY_ALIAS=alias/mobile-my-buys-secrets,
    JWT_SECRET_NAME=mobile-app/jwt-secret,
    ACTIVITY_TABLE=mobile-user-activity,
    AWS_REGION=us-west-2
  }" \
  --region us-west-2 \
  --no-verify-ssl

# Update Lambda code (for subsequent deployments)
aws lambda update-function-code \
  --function-name my-buys-handler \
  --zip-file fileb://my-buys-handler.zip \
  --region us-west-2 \
  --no-verify-ssl
```

### 4. Setup IAM Role

The Lambda execution role needs permissions for:
- DynamoDB: GetItem, PutItem, UpdateItem, DeleteItem, Query on `mobile-my-buys-applets`
- KMS: Encrypt, Decrypt, DescribeKey on `mobile-my-buys-secrets` key
- Secrets Manager: GetSecretValue on `mobile-app/jwt-secret`
- Activity logging: PutItem, UpdateItem on `mobile-user-activity` and `mobile-users`

### 5. Setup API Gateway

```bash
./setup-api-gateway.sh
```

This creates all API Gateway resources and methods for the My Buys endpoints.

## Endpoints

- `POST /v1/my-buys/applets` - Create applet
- `GET /v1/my-buys/applets` - List user's applets
- `PUT /v1/my-buys/applets/{appletId}` - Update applet
- `DELETE /v1/my-buys/applets/{appletId}` - Delete applet
- `POST /v1/my-buys/applets/test` - Test configuration (without creating applet)
- `POST /v1/my-buys/applets/{appletId}/test` - Test applet configuration
- `POST /v1/my-buys/applets/{appletId}/regenerate-url` - Get regenerated embed URL

## Environment Variables

- `MY_BUYS_TABLE` - DynamoDB table name (default: `mobile-my-buys-applets`)
- `KMS_KEY_ALIAS` - KMS key alias (default: `alias/mobile-my-buys-secrets`)
- `JWT_SECRET_NAME` - Secrets Manager secret name for session JWT (default: `mobile-app/jwt-secret`)
- `ACTIVITY_TABLE` - Activity logging table (default: `mobile-user-activity`)
- `AWS_REGION` - AWS region (default: `us-west-2`)

