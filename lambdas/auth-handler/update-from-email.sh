#!/bin/bash

# Update the FROM_EMAIL and FROM_NAME environment variables in the Lambda function
# Usage: ./update-from-email.sh [email] [name]
# Example: ./update-from-email.sh hello@bigbuys.io "Big Buys"

set -e

FROM_EMAIL="${1:-hello@bigbuys.io}"
FROM_NAME="${2:-Big Buys}"
LAMBDA_FUNCTION_NAME="mobile-auth-handler"
REGION="us-west-2"

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

echo "🔍 Getting current Lambda configuration..."
CURRENT_CONFIG=$(aws_cmd lambda get-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --region "$REGION" \
    --output json)

# Extract current environment variables, handling case where they might not exist
CURRENT_ENV=$(echo "$CURRENT_CONFIG" | python3 -c "
import sys, json
data = json.load(sys.stdin)
env = data.get('Environment', {}).get('Variables', {})
print(json.dumps(env))
")

OLD_EMAIL=$(echo "$CURRENT_ENV" | python3 -c "import sys, json; print(json.load(sys.stdin).get('FROM_EMAIL', 'NOT SET'))" 2>/dev/null || echo "NOT SET")
OLD_NAME=$(echo "$CURRENT_ENV" | python3 -c "import sys, json; print(json.load(sys.stdin).get('FROM_NAME', 'NOT SET'))" 2>/dev/null || echo "NOT SET")

echo "📝 Updating FROM_EMAIL and FROM_NAME environment variables..."
echo "   Old FROM_EMAIL: $OLD_EMAIL"
echo "   New FROM_EMAIL: $FROM_EMAIL"
echo "   Old FROM_NAME: $OLD_NAME"
echo "   New FROM_NAME: $FROM_NAME"

# Update the environment variables
UPDATED_ENV=$(echo "$CURRENT_ENV" | python3 << PYTHON_SCRIPT
import json
import sys

try:
    env_vars = json.load(sys.stdin)
except:
    env_vars = {}

env_vars['FROM_EMAIL'] = '$FROM_EMAIL'
env_vars['FROM_NAME'] = '$FROM_NAME'

print(json.dumps(env_vars))
PYTHON_SCRIPT
)

echo "🚀 Updating Lambda function configuration..."
# Create a temporary file for the environment JSON to avoid shell escaping issues
TMP_ENV_FILE=$(mktemp)
cat > "$TMP_ENV_FILE" << EOF
{
  "Variables": $UPDATED_ENV
}
EOF

aws_cmd lambda update-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --region "$REGION" \
    --environment "file://$TMP_ENV_FILE" \
    --query '[FunctionName,LastUpdateStatus]' \
    --output table

rm "$TMP_ENV_FILE"

echo ""
echo "✅ Environment variables updated!"
echo "   FROM_EMAIL: $FROM_EMAIL"
echo "   FROM_NAME: $FROM_NAME"
echo ""
echo "💡 The Lambda will now send emails from: \"$FROM_NAME\" <$FROM_EMAIL>"

