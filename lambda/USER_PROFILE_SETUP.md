# User Profile Setup - AWS CLI Commands

This document contains AWS CLI commands to set up the `mobile-users` DynamoDB table for lazy user provisioning with roles.

## Step 1: Create mobile-users DynamoDB Table

```bash
aws dynamodb create-table \
  --region us-west-2 \
  --table-name mobile-users \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "email-index",
        "KeySchema": [
          {"AttributeName": "email", "KeyType": "HASH"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      }
    ]'
```

## Step 2: Verify Table Creation

```bash
aws dynamodb describe-table \
  --region us-west-2 \
  --table-name mobile-users
```

## Step 3: Update Lambda IAM Policy

You need to update your Lambda execution role to include permissions for the new `mobile-users` table.

### Option A: If using inline policy (mobile-auth-lambda-policy)

```bash
# First, download the current policy
aws iam get-role-policy \
  --role-name mobile-auth-lambda-role \
  --policy-name mobile-auth-lambda-policy \
  --region us-west-2 > current-policy.json

# Edit the policy JSON to add mobile-users permissions (see below), then:
aws iam put-role-policy \
  --role-name mobile-auth-lambda-role \
  --policy-name mobile-auth-lambda-policy \
  --policy-document file://updated-policy.json \
  --region us-west-2
```

### Updated Policy JSON (add this to the DynamoDB section):

The DynamoDB section should now include:
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:Query"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-west-2:*:table/mobile-auth-tokens",
    "arn:aws:dynamodb:us-west-2:*:table/mobile-auth-tokens/index/*",
    "arn:aws:dynamodb:us-west-2:*:table/mobile-approved-emails",
    "arn:aws:dynamodb:us-west-2:*:table/mobile-users",
    "arn:aws:dynamodb:us-west-2:*:table/mobile-users/index/*"
  ]
}
```

### Option B: Quick policy update using AWS Console

1. Go to IAM → Roles → `mobile-auth-lambda-role`
2. Find the inline policy `mobile-auth-lambda-policy`
3. Edit the DynamoDB section to add:
   - `arn:aws:dynamodb:us-west-2:*:table/mobile-users`
   - `arn:aws:dynamodb:us-west-2:*:table/mobile-users/index/*`

## Step 4: Update Lambda Environment Variable (Optional)

If you're using a different table name, you can set it via environment variable:

```bash
aws lambda update-function-configuration \
  --function-name YOUR_LAMBDA_FUNCTION_NAME \
  --environment Variables="{USERS_TABLE=mobile-users}" \
  --region us-west-2
```

## Table Schema

The `mobile-users` table has the following structure:

- **Partition Key:** `userId` (String) - Unique user identifier
- **Global Secondary Index:** `email-index`
  - **Partition Key:** `email` (String) - For looking up users by email
  - **Projection:** ALL attributes

### Sample Item Structure:

```json
{
  "userId": "usr_abc123xyz",
  "email": "user@example.com",
  "role": "user",
  "createdAt": 1698765432,
  "updatedAt": 1698765432
}
```

### Role Values:

- `"user"` - Default role for regular users
- `"admin"` - Admin role (default for @sigmacomputing.com emails, can be manually updated)

## Testing

After setup, test by:

1. Requesting a magic link with a new email address
2. Verifying the link and logging in
3. Checking DynamoDB to see the new user profile was created:

```bash
aws dynamodb scan \
  --table-name mobile-users \
  --region us-west-2 \
  --max-items 5
```

## Notes

- **Lazy Provisioning**: User profiles are automatically created when a user first authenticates
- **Default Roles**: 
  - `@sigmacomputing.com` emails → `"admin"` role
  - All other emails → `"user"` role
- **Role Management**: To change a user's role, update the `role` attribute in the `mobile-users` table directly in DynamoDB

