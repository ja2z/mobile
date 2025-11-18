# Backdoor Authentication Setup

This document describes the backdoor authentication feature for development and testing purposes.

## Overview

The backdoor authentication allows a specific email address to authenticate directly without requiring a magic link. This feature requires both the correct email address and a shared secret stored in AWS Secrets Manager.

**Note**: The backdoor email is configured via environment variables and is not hardcoded in the source code for security.

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

The Lambda function requires the following environment variables:
- `BACKDOOR_SECRET_NAME=mobile-app/backdoor-secret` (already configured)
- `BACKDOOR_EMAIL=<backdoor-email-address>` (must be set - the specific email address allowed for backdoor authentication)

**Important**: Set the `BACKDOOR_EMAIL` environment variable in the Lambda function configuration. This email address is not hardcoded in the source code for security reasons.

### Mobile App Configuration

The mobile app reads the backdoor secret from an environment variable. Configuration differs for local development vs. EAS builds:

#### Local Development (Expo Dev Client / Expo Go)

For local testing, create a `.env.local` file in the project root:
```bash
EXPO_PUBLIC_BACKDOOR_EMAIL=<backdoor-email-address>
EXPO_PUBLIC_BACKDOOR_SECRET=GiQV4XdGKIb9BEXN18-GBlLOiYDE-De27h4ROOa1rso
```

**Important**: 
- Replace `<backdoor-email-address>` with the actual backdoor email address
- Restart the Expo dev server after creating/updating `.env.local`

#### EAS Builds (TestFlight / Production)

The backdoor email and secret are configured using **EAS Secrets**:

- **Secret Name**: `EXPO_PUBLIC_BACKDOOR_EMAIL` (must be set)
- **Secret Name**: `EXPO_PUBLIC_BACKDOOR_SECRET` (already set up)
- **Scope**: Project-level (shared across all build profiles)

The secrets are automatically injected into all EAS builds (development, preview, production). No additional configuration needed in `eas.json` or build scripts.

**Managing EAS Secrets**:
```bash
# List all secrets
eas secret:list

# Set/update the backdoor email
eas secret:create --name EXPO_PUBLIC_BACKDOOR_EMAIL --value "<backdoor-email-address>"
# or update if it already exists
eas secret:update --name EXPO_PUBLIC_BACKDOOR_EMAIL --value "<backdoor-email-address>"

# Update/rotate the secret
eas secret:update --name EXPO_PUBLIC_BACKDOOR_SECRET --value "new-secret-value"

# Delete secret (if needed)
eas secret:delete EXPO_PUBLIC_BACKDOOR_EMAIL
eas secret:delete EXPO_PUBLIC_BACKDOOR_SECRET
```

**Note**: EAS Secrets store values securely and don't allow viewing the actual secret value for security reasons. You can only create, update, or delete secrets.

**Note**: When rotating the secret, update both:
1. AWS Secrets Manager (`mobile-app/backdoor-secret`)
2. EAS Secret (`EXPO_PUBLIC_BACKDOOR_SECRET`)
3. Local `.env.local` (for developers)

**Note**: The backdoor email must be set in:
1. Lambda environment variable (`BACKDOOR_EMAIL`)
2. EAS Secret (`EXPO_PUBLIC_BACKDOOR_EMAIL`)
3. Local `.env.local` (for developers)

## Usage

1. Open the login screen
2. Enter the backdoor email (configured via environment variables)
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
- Verify you're using the correct backdoor email address (check environment variables)
- Check that the `BACKDOOR_EMAIL` environment variable is set in Lambda
- Check that `EXPO_PUBLIC_BACKDOOR_EMAIL` is set in EAS Secrets or `.env.local`
- Check that the secret matches between AWS Secrets Manager and the app configuration

### "Backdoor authentication not configured" error
- Ensure the `BACKDOOR_EMAIL` environment variable is set in the Lambda function configuration
- Verify the Lambda has the correct environment variable configured

