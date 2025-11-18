#!/bin/bash

# Update the BACKDOOR_EMAIL environment variable in the Lambda function

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

NEW_EMAIL="W4YpxgLLLpkqUhrCi@sigmacomputing.com"
LAMBDA_FUNCTION_NAME="mobile-auth-handler"
REGION="us-west-2"

echo "🔍 Getting current Lambda configuration..."
CURRENT_CONFIG=$(aws_cmd lambda get-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --region "$REGION" \
    --output json)

CURRENT_ENV=$(echo "$CURRENT_CONFIG" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin)['Environment']['Variables']))")

echo "📝 Updating BACKDOOR_EMAIL environment variable..."
echo "   Old email: $(echo "$CURRENT_ENV" | python3 -c "import sys, json; print(json.load(sys.stdin).get('BACKDOOR_EMAIL', 'NOT SET'))")"
echo "   New email: $NEW_EMAIL"

# Update the environment variable
UPDATED_ENV=$(echo "$CURRENT_ENV" | python3 << PYTHON_SCRIPT
import json
import sys

env_vars = json.load(sys.stdin)
env_vars['BACKDOOR_EMAIL'] = '$NEW_EMAIL'

print(json.dumps(env_vars))
PYTHON_SCRIPT
)

echo "🚀 Updating Lambda function configuration..."
aws_cmd lambda update-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --region "$REGION" \
    --environment "Variables=$UPDATED_ENV" \
    --output json > /dev/null

echo ""
echo "✅ Lambda environment variable updated successfully!"
echo "   BACKDOOR_EMAIL is now set to: $NEW_EMAIL"
echo ""
echo "⚠️  IMPORTANT: Also update the following:"
echo "   1. EAS Secret: EXPO_PUBLIC_BACKDOOR_EMAIL"
echo "   2. Local .env.local files for developers"
echo ""
echo "   Run: eas secret:update --name EXPO_PUBLIC_BACKDOOR_EMAIL --value \"$NEW_EMAIL\""

