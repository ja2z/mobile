#!/bin/bash

# Fix IAM permissions to allow Lambda to read Telnyx API key secret from Secrets Manager

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

echo "🔍 Getting current IAM policy..."
TMP_FILE=$(mktemp)
aws_cmd iam get-role-policy \
    --role-name mobile-auth-lambda-role \
    --policy-name mobile-auth-lambda-policy \
    --output json 2>&1 | grep -v "InsecureRequestWarning" | grep -v "^warnings.warn(" > "$TMP_FILE" || {
    echo "❌ Error: Failed to get IAM policy"
    rm -f "$TMP_FILE"
    exit 1
}

# Extract PolicyDocument from the response
POLICY_DOC=$(python3 -c "import sys, json; data=json.load(open('$TMP_FILE')); print(json.dumps(data['PolicyDocument']))")

echo "📝 Updating policy to include telnyx-api-key secret..."

# Use Python to update the JSON policy document
UPDATED_POLICY=$(echo "$POLICY_DOC" | python3 << 'PYTHON_SCRIPT'
import json
import sys

try:
    policy = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error parsing JSON: {e}", file=sys.stderr)
    sys.exit(1)

# Find the secretsmanager statement
found = False
for statement in policy.get('Statement', []):
    actions = statement.get('Action', [])
    if isinstance(actions, str):
        actions = [actions]
    
    if 'secretsmanager:GetSecretValue' in actions:
        found = True
        # Add telnyx-api-key secret to the Resource list if not already present
        resources = statement.get('Resource', [])
        if isinstance(resources, str):
            resources = [resources]
        
        telnyx_arn = "arn:aws:secretsmanager:*:*:secret:mobile-app/telnyx-api-key-*"
        
        if telnyx_arn not in resources:
            resources.append(telnyx_arn)
            statement['Resource'] = resources
            print("✓ Added telnyx-api-key secret to IAM policy", file=sys.stderr)
        else:
            print("✓ telnyx-api-key secret already in IAM policy", file=sys.stderr)
        break

if not found:
    print("⚠️  Warning: No secretsmanager statement found in policy", file=sys.stderr)

print(json.dumps(policy))
PYTHON_SCRIPT
)

rm -f "$TMP_FILE"

echo "🚀 Updating IAM policy..."
aws_cmd iam put-role-policy \
    --role-name mobile-auth-lambda-role \
    --policy-name mobile-auth-lambda-policy \
    --policy-document "$UPDATED_POLICY"

echo ""
echo "✅ IAM policy updated successfully!"
echo "   The Lambda can now read the Telnyx API key secret from Secrets Manager."

