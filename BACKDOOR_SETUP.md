# Backdoor Authentication Setup

This document describes the backdoor authentication feature for development and testing purposes.

## Overview

The backdoor authentication allows a specific email address (`gAz23xG8Pka3Ffn9a@sigmacomputing.com`) to authenticate directly without requiring a magic link. This feature requires both the correct email address and a shared secret stored in AWS Secrets Manager.

## Security Features

1. **Shared Secret Authentication**: Requires a secret stored in AWS Secrets Manager
2. **Email Validation**: Only the specific backdoor email is accepted
3. **Privacy**: The backdoor email address is not logged in DynamoDB activity logs (shows as "backdoor user" instead)
4. **Failed Attempt Logging**: All failed authentication attempts are logged for security monitoring

## Configuration

### AWS Secrets Manager

The backdoor secret is stored in AWS Secrets Manager:
- **Secret Name**: `mobile-app/backdoor-secret`
- **Region**: `us-west-2`
- **Current Secret Value**: `GiQV4XdGKIb9BEXN18-GBlLOiYDE-De27h4ROOa1rso`

To view or update the secret:
```bash
export AWS_PROFILE=saml
aws secretsmanager get-secret-value \
  --secret-id mobile-app/backdoor-secret \
  --region us-west-2 \
  --no-verify-ssl

# To update the secret:
aws secretsmanager update-secret \
  --secret-id mobile-app/backdoor-secret \
  --secret-string "new-secret-value" \
  --region us-west-2 \
  --no-verify-ssl
```

### Lambda Environment Variables

The Lambda function has been configured with:
- `BACKDOOR_SECRET_NAME=mobile-app/backdoor-secret`

### Mobile App Configuration

The mobile app reads the backdoor secret from an environment variable. Configuration differs for local development vs. EAS builds:

#### Local Development (Expo Dev Client / Expo Go)

For local testing, create a `.env.local` file in the project root:
```bash
EXPO_PUBLIC_BACKDOOR_SECRET=GiQV4XdGKIb9BEXN18-GBlLOiYDE-De27h4ROOa1rso
```

**Important**: Restart the Expo dev server after creating/updating `.env.local`.

#### EAS Builds (TestFlight / Production)

The secret is configured using **EAS Secrets** (already set up):

- **Secret Name**: `EXPO_PUBLIC_BACKDOOR_SECRET`
- **Scope**: Project-level (shared across all build profiles)
- **Status**: ✅ Configured

The secret is automatically injected into all EAS builds (development, preview, production). No additional configuration needed in `eas.json` or build scripts.

**Managing EAS Secrets**:
```bash
# List all secrets
eas secret:list

# Update/rotate the secret
eas secret:update --name EXPO_PUBLIC_BACKDOOR_SECRET --value "new-secret-value"

# Delete secret (if needed)
eas secret:delete EXPO_PUBLIC_BACKDOOR_SECRET
```

**Note**: EAS Secrets store values securely and don't allow viewing the actual secret value for security reasons. You can only create, update, or delete secrets.

**Note**: When rotating the secret, update both:
1. AWS Secrets Manager (`mobile-app/backdoor-secret`)
2. EAS Secret (`EXPO_PUBLIC_BACKDOOR_SECRET`)
3. Local `.env.local` (for developers)

## Usage

1. Open the login screen
2. Enter the backdoor email: `gAz23xG8Pka3Ffn9a@sigmacomputing.com`
3. Click "Continue"
4. The app will authenticate directly (no magic link email sent)

## Security Considerations

- **Secret Storage**: 
  - **Lambda**: Stored in AWS Secrets Manager (`mobile-app/backdoor-secret`)
  - **Mobile App**: Stored in EAS Secrets for builds, `.env.local` for local development
  - Secrets are encrypted and not included in codebase or git
- **Secret Rotation**: When rotating, update in three places:
  1. AWS Secrets Manager (Lambda validation)
  2. EAS Secrets (TestFlight builds)
  3. Local `.env.local` files (developer machines)
- **Access Control**: 
  - AWS Secrets Manager: Only users with AWS access can view/update
  - EAS Secrets: Only team members with Expo project access can manage
- **Logging**: Failed attempts are logged with IP addresses for security monitoring
- **Privacy**: The backdoor email is never logged in DynamoDB (shows as "backdoor user")

## Troubleshooting

### "Backdoor secret not configured" error
- Ensure `.env.local` exists with `EXPO_PUBLIC_BACKDOOR_SECRET` set
- Restart the Expo development server after creating/updating `.env.local`

### "Invalid secret" error
- **For local development**: Verify the secret in `.env.local` matches AWS Secrets Manager
- **For EAS builds**: Verify the EAS Secret matches AWS Secrets Manager
- Check that the Lambda has permission to read from Secrets Manager
- Ensure you've restarted the Expo dev server after updating `.env.local`

### "Access denied" error
- Verify you're using the correct backdoor email address
- Check that the secret matches between AWS Secrets Manager and the app configuration

