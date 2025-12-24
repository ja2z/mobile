# DynamoDB Setup for Phone Validation Feature

This document contains AWS CLI commands and schema information for the phone validation feature.

## New Table: mobile-phone-verifications

Create the phone verification codes table:

```bash
cd lambdas/phone-validation-handler
./setup-dynamodb.sh
```

Or manually:

```bash
aws dynamodb create-table \
  --region us-west-2 \
  --table-name mobile-phone-verifications \
  --attribute-definitions \
    AttributeName=verificationId,AttributeType=S \
    AttributeName=phoneNumber,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=verificationId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --time-to-live-specification Enabled=true,AttributeName=expiresAt \
  --global-secondary-indexes '[
    {
      "IndexName": "phone-email-index",
      "KeySchema": [
        {"AttributeName": "phoneNumber", "KeyType": "HASH"},
        {"AttributeName": "email", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]'
```

### Table Schema

- **Partition Key**: `verificationId` (String) - Format: `ver_<random>`
- **TTL Attribute**: `expiresAt` (Number) - Unix timestamp (5 minutes from creation)
- **Global Secondary Index**: `phone-email-index`
  - Partition Key: `phoneNumber` (String)
  - Sort Key: `email` (String)
  - Purpose: Look up verification codes by phone+email

### Attributes

- `verificationId` (String) - Unique verification ID (partition key)
- `phoneNumber` (String) - Phone number in E.164 format (e.g., `+14155551234`)
- `email` (String) - Email address (lowercase)
- `verificationCode` (String) - 5-digit verification code (10000-99999)
- `createdAt` (Number) - Unix timestamp when code was created
- `expiresAt` (Number) - Unix timestamp when code expires (TTL attribute, 5 minutes)
- `used` (Boolean) - Whether code has been used (default: false)
- `usedAt` (Number, optional) - Unix timestamp when code was verified

### Sample Item

```json
{
  "verificationId": "ver_a1b2c3d4e5f6g7h8",
  "phoneNumber": "+14155551234",
  "email": "user@example.com",
  "verificationCode": "12345",
  "createdAt": 1698765432,
  "expiresAt": 1698765732,
  "used": false
}
```

## Schema Updates for Existing Tables

### mobile-users Table

The following field is added (no migration needed, field is optional):

- `phoneNumber` (String, optional) - Phone number in E.164 format (e.g., `+14155551234`)

**No AWS CLI command needed** - this field will be added automatically when users are created/updated after phone verification.

### Updated mobile-users Schema

- **Partition Key**: `userId` (String)
- **Global Secondary Index**: `email-index` (existing)
- **New Attribute**:
  - `phoneNumber` (String, optional) - E.164 format phone number

### Sample User Item with Phone Number

```json
{
  "userId": "usr_abc123xyz",
  "email": "user@example.com",
  "role": "basic",
  "phoneNumber": "+14155551234",
  "registrationMethod": "phone",
  "createdAt": 1698765432,
  "updatedAt": 1698765732
}
```

## Verify Table Creation

```bash
# Check verification codes table
aws dynamodb describe-table \
  --table-name mobile-phone-verifications \
  --region us-west-2 \
  --query 'Table.[TableName,TableStatus,AttributeDefinitions[*].[AttributeName,AttributeType],GlobalSecondaryIndexes[*].[IndexName,KeySchema[*].[AttributeName,KeyType]]]' \
  --output table

# Check TTL configuration
aws dynamodb describe-time-to-live \
  --table-name mobile-phone-verifications \
  --region us-west-2
```

## Notes

- Verification codes expire after 5 minutes (handled by DynamoDB TTL)
- Codes are one-time use (marked as `used: true` after verification)
- Phone numbers are stored in E.164 format (international format with country code)
- The `phone-email-index` GSI allows efficient lookup of verification codes by phone number and email combination

