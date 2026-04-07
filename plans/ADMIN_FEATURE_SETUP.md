# Admin Feature Setup Notes

## Required Dependencies

### Mobile App

The admin feature requires the following additional npm package:

```bash
npm install @react-native-community/datetimepicker
```

This package is used in:
- `components/EditUserModal.tsx` - For selecting user expiration dates
- `components/AddWhitelistUserModal.tsx` - For selecting whitelist expiration dates

### Lambda Functions

All Lambda functions need to have the shared utilities available. When building/deploying:

1. **auth-handler**: Already configured to include shared utilities
2. **generate-url**: Updated to TypeScript, includes shared utilities
3. **admin-handler**: New Lambda, includes shared utilities

Make sure to run `npm install` in each Lambda directory before building.

## AWS Setup Required

See `lambdas/admin-handler/DYNAMODB_SETUP.md` for:
- DynamoDB table creation commands
- IAM policy updates
- Schema documentation

## Configuration

Update `constants/Config.ts` with your admin Lambda API Gateway URL:
- `ADMIN_BASE_URL`: Should point to your API Gateway endpoint for the admin Lambda

## Testing

1. Create an admin user in DynamoDB:
   ```bash
   aws dynamodb update-item \
     --table-name mobile-users \
     --key '{"userId": {"S": "YOUR_USER_ID"}}' \
     --update-expression "SET #role = :role" \
     --expression-attribute-names '{"#role": "role"}' \
     --expression-attribute-values '{":role": {"S": "admin"}}' \
     --region us-west-2
   ```

2. Log in with the admin user
3. Check that Admin button appears in ProfileMenu
4. Test all admin features

