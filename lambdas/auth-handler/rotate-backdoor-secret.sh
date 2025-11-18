#!/bin/bash

# Rotate the backdoor secret in AWS Secrets Manager and provide instructions for other updates

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

SECRET_NAME="mobile-app/backdoor-secret"
REGION="us-west-2"

# Generate a new secure secret
echo "🔐 Generating new backdoor secret..."
NEW_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

echo "📝 New secret generated: ${NEW_SECRET:0:20}..."
echo ""

# Update AWS Secrets Manager
echo "🔄 Updating secret in AWS Secrets Manager..."
aws_cmd secretsmanager update-secret \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --secret-string "$NEW_SECRET" \
    --output json > /dev/null

echo "✅ AWS Secrets Manager updated successfully!"
echo ""

echo "⚠️  IMPORTANT: You must also update the following:"
echo ""
echo "1. EAS Environment Variable (for mobile app builds):"
echo "   eas env:create --name EXPO_PUBLIC_BACKDOOR_SECRET --value \"$NEW_SECRET\" --scope project --type string --visibility secret"
echo "   (or update if it already exists - you may need to delete and recreate)"
echo ""
echo "2. Local .env.local files (for all developers):"
echo "   Update EXPO_PUBLIC_BACKDOOR_SECRET=$NEW_SECRET"
echo "   Restart Expo dev server after updating"
echo ""
echo "📋 Full secret value (copy this):"
echo "$NEW_SECRET"

