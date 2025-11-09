# DynamoDB Setup for Admin Feature

This document contains AWS CLI commands to set up the DynamoDB tables and schema updates needed for the admin feature.

## New Table: mobile-user-activity

Create the activity logging table:

```bash
aws dynamodb create-table \
  --region us-west-2 \
  --table-name mobile-user-activity \
  --attribute-definitions \
    AttributeName=activityId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=timestamp,AttributeType=N \
  --key-schema \
    AttributeName=activityId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "userId-timestamp-index",
        "KeySchema": [
          {"AttributeName": "userId", "KeyType": "HASH"},
          {"AttributeName": "timestamp", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      }
    ]'
```

## Schema Updates for Existing Tables

### mobile-users Table

The following fields are added (no migration needed, fields are optional):

- `expirationDate` (Number, optional) - Unix timestamp when user account expires
- `isDeactivated` (Boolean, default false) - Whether user is deactivated
- `deactivatedAt` (Number, optional) - Unix timestamp when user was deactivated
- `lastActiveAt` (Number, optional) - Unix timestamp of last API activity
- `registrationMethod` (String) - "email" or "sms"

**No AWS CLI command needed** - these fields will be added automatically when users are created/updated.

### mobile-approved-emails Table

The following fields are added (no migration needed, fields are optional):

- `role` (String, default "basic") - Role to assign when user registers ("basic" or "admin")
- `expirationDate` (Number, optional) - Unix timestamp when whitelist entry expires
- `registeredAt` (Number, optional) - Unix timestamp when user actually registered

**No AWS CLI command needed** - these fields will be added automatically when whitelist entries are created/updated.

## Verify Table Creation

```bash
aws dynamodb describe-table \
  --region us-west-2 \
  --table-name mobile-user-activity
```

## Update Lambda IAM Policies

Update your Lambda execution roles to include permissions for the new table and updated operations.

### For auth-handler Lambda

```bash
# Get current policy
aws iam get-role-policy \
  --role-name mobile-auth-lambda-role \
  --policy-name mobile-auth-lambda-policy \
  --region us-west-2 > current-policy.json

# Edit the policy JSON to add mobile-user-activity permissions, then:
aws iam put-role-policy \
  --role-name mobile-auth-lambda-role \
  --policy-name mobile-auth-lambda-policy \
  --policy-document file://updated-policy.json \
  --region us-west-2
```

### For generate-url Lambda

```bash
# Get current policy
aws iam get-role-policy \
  --role-name generate-url-lambda-role \
  --policy-name generate-url-lambda-policy \
  --region us-west-2 > current-policy.json

# Edit the policy JSON to add mobile-user-activity permissions, then:
aws iam put-role-policy \
  --role-name generate-url-lambda-role \
  --policy-name generate-url-lambda-policy \
  --policy-document file://updated-policy.json \
  --region us-west-2
```

### For admin-handler Lambda (New)

Create a new IAM role and policy for the admin Lambda:

```bash
# Create role
aws iam create-role \
  --role-name mobile-admin-lambda-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --region us-west-2

# Attach basic Lambda execution policy
aws iam attach-role-policy \
  --role-name mobile-admin-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --region us-west-2

# Create inline policy for DynamoDB access
aws iam put-role-policy \
  --role-name mobile-admin-lambda-role \
  --policy-name mobile-admin-lambda-policy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-west-2:*:table/mobile-users",
        "arn:aws:dynamodb:us-west-2:*:table/mobile-users/index/*",
        "arn:aws:dynamodb:us-west-2:*:table/mobile-approved-emails",
        "arn:aws:dynamodb:us-west-2:*:table/mobile-user-activity",
        "arn:aws:dynamodb:us-west-2:*:table/mobile-user-activity/index/*",
        "arn:aws:dynamodb:us-west-2:*:table/mobile-auth-tokens",
        "arn:aws:dynamodb:us-west-2:*:table/mobile-auth-tokens/index/*"
      ]
    }, {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-west-2:*:secret:mobile-app/jwt-secret*"
      ]
    }]
  }' \
  --region us-west-2
```

## Table Schema Summary

### mobile-user-activity

- **Partition Key:** `activityId` (String)
- **GSI:** `userId-timestamp-index`
  - Partition Key: `userId` (String)
  - Sort Key: `timestamp` (Number)
- **Attributes:**
  - `activityId` (String) - Unique activity ID
  - `userId` (String) - User ID
  - `email` (String) - User email
  - `eventType` (String) - Event type: "login", "app_launch", "applet_launch", "failed_login", etc.
  - `timestamp` (Number) - Unix timestamp
  - `deviceId` (String, optional) - Device ID
  - `ipAddress` (String, optional) - IP address
  - `metadata` (Map, optional) - Additional event-specific data

### Updated mobile-users Schema

- **Partition Key:** `userId` (String)
- **GSI:** `email-index` (existing)
- **New Attributes:**
  - `expirationDate` (Number, optional)
  - `isDeactivated` (Boolean, default false)
  - `deactivatedAt` (Number, optional)
  - `lastActiveAt` (Number, optional)
  - `registrationMethod` (String) - "email" or "sms"

### Updated mobile-approved-emails Schema

- **Partition Key:** `email` (String)
- **New Attributes:**
  - `role` (String, default "basic")
  - `expirationDate` (Number, optional)
  - `registeredAt` (Number, optional)

