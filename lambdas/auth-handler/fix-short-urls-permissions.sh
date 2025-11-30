#!/bin/bash

# Fix IAM permissions to allow Lambda to read/write to mobile-short-urls DynamoDB table

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
    --output json > "$TMP_FILE" 2>&1

if [ ! -s "$TMP_FILE" ]; then
    echo "❌ Error: Failed to get IAM policy"
    cat "$TMP_FILE"
    rm -f "$TMP_FILE"
    exit 1
fi

POLICY_DOC=$(python3 -c "import sys, json; data=json.load(open('$TMP_FILE')); print(json.dumps(data['PolicyDocument']))" 2>&1)

echo "📝 Updating policy to include mobile-short-urls table..."

# Use Python to update the JSON policy document
UPDATED_POLICY=$(echo "$POLICY_DOC" | python3 << 'PYTHON_SCRIPT'
import json
import sys

policy = json.load(sys.stdin)

# Find the DynamoDB statement
dynamodb_statement = None
for statement in policy['Statement']:
    if 'dynamodb' in str(statement.get('Action', [])).lower():
        dynamodb_statement = statement
        break

if dynamodb_statement:
    # Add mobile-short-urls table to the Resource list if not already present
    resources = dynamodb_statement.get('Resource', [])
    short_urls_table_arn = "arn:aws:dynamodb:*:*:table/mobile-short-urls"
    
    if short_urls_table_arn not in resources:
        resources.append(short_urls_table_arn)
        dynamodb_statement['Resource'] = resources
        print("✓ Added mobile-short-urls table to IAM policy", file=sys.stderr)
    else:
        print("✓ mobile-short-urls table already in IAM policy", file=sys.stderr)
else:
    # No DynamoDB statement found, create one
    print("⚠ No DynamoDB statement found, creating new one", file=sys.stderr)
    new_statement = {
        "Effect": "Allow",
        "Action": [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:Query"
        ],
        "Resource": [
            "arn:aws:dynamodb:*:*:table/mobile-short-urls"
        ]
    }
    policy['Statement'].append(new_statement)
    print("✓ Created new DynamoDB statement with mobile-short-urls table", file=sys.stderr)

print(json.dumps(policy, indent=2))
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
echo "   The Lambda can now read/write to the mobile-short-urls DynamoDB table."

