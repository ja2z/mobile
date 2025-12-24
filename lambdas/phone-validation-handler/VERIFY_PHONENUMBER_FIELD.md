# Verification: phoneNumber Field in mobile-users Table

## Code Implementation Verification

✅ **The code correctly adds `phoneNumber` to the mobile-users table.**

### Implementation Location

**File:** `lambdas/phone-validation-handler/index.ts`

**Lines 317-326:** After successful phone verification, the code updates the user record:

```typescript
// Update user record to add phoneNumber
await docClient.send(new UpdateCommand({
  TableName: USERS_TABLE,
  Key: { userId: user.userId },
  UpdateExpression: 'SET phoneNumber = :phone, updatedAt = :now',
  ExpressionAttributeValues: {
    ':phone': phoneNumber,
    ':now': now
  }
}));
```

### How It Works

1. **After verification code is validated** (line 302)
2. **After whitelist check passes** (line 305-312)
3. **User profile is created/retrieved** (line 315)
4. **phoneNumber is added to user record** (line 318-326)

The `UpdateExpression: 'SET phoneNumber = :phone'` will:
- Add `phoneNumber` field if it doesn't exist
- Update `phoneNumber` field if it already exists
- Set `updatedAt` timestamp

## DynamoDB Schema Note

**Important:** DynamoDB is schemaless, so:
- The `phoneNumber` field is **not** defined in the table schema
- The field will be **automatically added** when users verify their phone numbers
- Existing users without phone numbers will not have this field (it's optional)
- New users created via phone validation will have the field

## Verification Commands

### Check if any users have phoneNumber field:

```bash
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# Scan for users with phoneNumber
aws dynamodb scan \
  --table-name mobile-users \
  --region us-west-2 \
  --no-verify-ssl \
  --filter-expression "attribute_exists(phoneNumber)" \
  --projection-expression "userId,email,phoneNumber" \
  --max-items 10
```

### Check a specific user:

```bash
# Replace USER_ID with actual userId
aws dynamodb get-item \
  --table-name mobile-users \
  --region us-west-2 \
  --no-verify-ssl \
  --key '{"userId": {"S": "usr_abc123xyz"}}' \
  --projection-expression "userId,email,phoneNumber"
```

### Expected User Record After Phone Verification:

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

## Testing

To verify the field is added correctly:

1. **Call `/v1/phone/validate`** with a valid phone number
2. **Receive SMS** with verification code
3. **Call `/v1/phone/verify`** with the code
4. **Check DynamoDB** - user record should now have `phoneNumber` field

## Summary

✅ **Code Implementation:** Correct - uses `UpdateCommand` with `SET phoneNumber = :phone`  
✅ **Field Type:** String (E.164 format, e.g., `+14155551234`)  
✅ **Optional:** Yes - field only exists for users who have verified their phone  
✅ **No Migration Needed:** DynamoDB is schemaless, field is added automatically  

The `phoneNumber` field will be added to user records in the `mobile-users` table when users successfully verify their phone numbers via the `/v1/phone/verify` endpoint.

