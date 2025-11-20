#!/bin/bash

# Fix IAM permissions to allow Lambda to read backdoor secret from Secrets Manager

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
    --output json > "$TMP_FILE" 2>/dev/null

POLICY_DOC=$(python3 -c "import sys, json; data=json.load(open('$TMP_FILE')); print(json.dumps(data['PolicyDocument']))")

echo "📝 Updating policy to include backdoor-secret..."

# Use Python to update the JSON policy document
UPDATED_POLICY=$(echo "$POLICY_DOC" | python3 << 'PYTHON_SCRIPT'
import json
import sys

policy = json.load(sys.stdin)

# Find the secretsmanager statement
for statement in policy['Statement']:
    if 'secretsmanager:GetSecretValue' in statement.get('Action', []):
        # Add backdoor-secret to the Resource list if not already present
        resources = statement.get('Resource', [])
        backdoor_arn = "arn:aws:secretsmanager:*:*:secret:mobile-app/backdoor-secret-*"
        
        if backdoor_arn not in resources:
            resources.append(backdoor_arn)
            statement['Resource'] = resources
            print("✓ Added backdoor-secret to IAM policy", file=sys.stderr)
        else:
            print("✓ backdoor-secret already in IAM policy", file=sys.stderr)
        break

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
echo "   The Lambda can now read the backdoor secret from Secrets Manager."

