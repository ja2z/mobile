#!/bin/bash

# Grant IAM permissions to allow a Lambda function to read a secret from Secrets Manager
# 
# Usage:
#   ./grant-secret-permissions.sh [LAMBDA_FUNCTION_NAME] [SECRET_ARN] [REGION]
#
# Examples:
#   ./grant-secret-permissions.sh generateSigmaEmbedURL "arn:aws:secretsmanager:us-west-2:*:secret:mobile-app/jwt-secret-papercranestaging-*" us-west-2
#   ./grant-secret-permissions.sh my-lambda "arn:aws:secretsmanager:us-west-2:*:secret:my-secret-*" us-west-2
#
# If arguments are not provided, defaults to:
#   LAMBDA_FUNCTION_NAME: generateSigmaEmbedURL
#   SECRET_ARN: arn:aws:secretsmanager:us-west-2:*:secret:mobile-app/jwt-secret-papercranestaging-*
#   REGION: us-west-2

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

# Parse arguments or use defaults
FUNCTION_NAME="${1:-generateSigmaEmbedURL}"
SECRET_ARN="${2:-arn:aws:secretsmanager:us-west-2:*:secret:mobile-app/jwt-secret-papercranestaging-*}"
REGION="${3:-us-west-2}"

# Verify authentication
echo "🔐 Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

# Find the Lambda function's role name
echo "🔍 Finding Lambda function role for: $FUNCTION_NAME..."

ROLE_ARN=$(aws_cmd lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'Role' \
    --output text)

if [ -z "$ROLE_ARN" ]; then
    echo "❌ Error: Could not find Lambda function role"
    exit 1
fi

# Extract role name from ARN (format: arn:aws:iam::ACCOUNT:role/ROLE_NAME)
ROLE_NAME=$(echo "$ROLE_ARN" | sed 's/.*\///')
echo "✓ Found role: $ROLE_NAME"
echo ""

# Find the policy name
echo "🔍 Finding IAM policy name..."
POLICIES=$(aws_cmd iam list-role-policies \
    --role-name "$ROLE_NAME" \
    --output json)

# Look for a policy that contains secretsmanager permissions
POLICY_NAME=""
if echo "$POLICIES" | grep -q "SecretsManagerAccess"; then
    POLICY_NAME="SecretsManagerAccess"
elif echo "$POLICIES" | grep -q "secretsmanager"; then
    # Try to find any policy with secretsmanager in the name
    POLICY_NAME=$(echo "$POLICIES" | python3 -c "import sys, json; data=json.load(sys.stdin); policies=[p for p in data.get('PolicyNames', []) if 'secret' in p.lower()]; print(policies[0] if policies else '')")
fi

# If no policy found, check if there's a single inline policy
if [ -z "$POLICY_NAME" ]; then
    POLICY_COUNT=$(echo "$POLICIES" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('PolicyNames', [])))")
    if [ "$POLICY_COUNT" -eq 1 ]; then
        POLICY_NAME=$(echo "$POLICIES" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('PolicyNames', [])[0])")
    fi
fi

if [ -z "$POLICY_NAME" ]; then
    echo "❌ Error: Could not determine policy name. Available policies:"
    echo "$POLICIES" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f'  - {p}') for p in data.get('PolicyNames', [])]"
    exit 1
fi

echo "✓ Found policy: $POLICY_NAME"
echo ""

# Get current policy
echo "🔍 Getting current IAM policy..."

# Get policy directly and extract PolicyDocument in one step
POLICY_DOC=$(aws iam get-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "$POLICY_NAME" \
    --no-verify-ssl \
    --output json 2> >(grep -v "InsecureRequestWarning" >&2) | python3 -c "
import sys
import json

try:
    data = json.load(sys.stdin)
    policy_doc = data.get('PolicyDocument', {})
    if not policy_doc:
        print('Error: PolicyDocument is empty', file=sys.stderr)
        sys.exit(1)
    print(json.dumps(policy_doc))
except json.JSONDecodeError as e:
    print(f'Error parsing JSON: {e}', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
")

# Verify we got valid JSON
if [ -z "$POLICY_DOC" ] || ! echo "$POLICY_DOC" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
    echo "❌ Error: Failed to get valid policy document"
    echo "POLICY_DOC value: $POLICY_DOC"
    exit 1
fi

echo "📝 Updating policy to include papercranestaging secret..."

# Verify POLICY_DOC is not empty before processing
if [ -z "$POLICY_DOC" ]; then
    echo "❌ Error: POLICY_DOC is empty"
    exit 1
fi

# Use Python to update the JSON policy document
# Pass POLICY_DOC and SECRET_ARN as environment variables to avoid heredoc stdin issues
# Note: Using environment variables instead of stdin because heredoc takes precedence over pipe
UPDATED_POLICY=$(POLICY_DOC_JSON="$POLICY_DOC" SECRET_ARN="$SECRET_ARN" python3 << 'PYTHON_SCRIPT'
import json
import sys
import os

policy_json = os.environ.get('POLICY_DOC_JSON', '{}')
policy = json.loads(policy_json)

# Find the secretsmanager statement
found = False
for statement in policy['Statement']:
    actions = statement.get('Action', [])
    if isinstance(actions, str):
        actions = [actions]
    
    if 'secretsmanager:GetSecretValue' in actions:
        # Add papercranestaging secret to the Resource list if not already present
        resources = statement.get('Resource', [])
        if isinstance(resources, str):
            resources = [resources]
        
        secret_arn = os.environ.get('SECRET_ARN', '')
        
        if secret_arn not in resources:
            resources.append(secret_arn)
            statement['Resource'] = resources
            print(f"✓ Added secret ARN to IAM policy: {secret_arn}", file=sys.stderr)
            found = True
        else:
            print(f"✓ Secret ARN already in IAM policy: {secret_arn}", file=sys.stderr)
            found = True
        break

if not found:
    # If no secretsmanager statement found, create one
    secret_arn = os.environ.get('SECRET_ARN', '')
    print("⚠️ No secretsmanager statement found, creating new one", file=sys.stderr)
    new_statement = {
        "Effect": "Allow",
        "Action": ["secretsmanager:GetSecretValue"],
        "Resource": [secret_arn]
    }
    policy['Statement'].append(new_statement)
    print("✓ Created new secretsmanager statement", file=sys.stderr)

print(json.dumps(policy))
PYTHON_SCRIPT
)

echo "🚀 Updating IAM policy..."
aws_cmd iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "$POLICY_NAME" \
    --policy-document "$UPDATED_POLICY"

echo ""
echo "✅ IAM policy updated successfully!"
echo "   Lambda function: $FUNCTION_NAME"
echo "   Role: $ROLE_NAME"
echo "   Policy: $POLICY_NAME"
echo "   Secret ARN: $SECRET_ARN"
echo ""
echo "   The Lambda can now read the secret from Secrets Manager."

