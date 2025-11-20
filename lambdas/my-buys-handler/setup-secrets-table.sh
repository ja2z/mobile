#!/bin/bash

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

# Verify authentication before proceeding
echo "Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi

echo "✓ AWS CLI authenticated"
echo ""

REGION="us-west-2"
TABLE_NAME="mobile-my-buys-secrets"

echo "Creating DynamoDB table: $TABLE_NAME"
echo "Region: $REGION"
echo "Note: This table uses row-level security with composite key (userId, secretName)"
echo ""

# Create the table with composite key for row-level security
echo "Creating table..."
aws_cmd dynamodb create-table \
    --region $REGION \
    --table-name $TABLE_NAME \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=secretName,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=secretName,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST

if [ $? -ne 0 ]; then
    echo "✗ Failed to create DynamoDB table"
    exit 1
fi

echo "✓ Table creation initiated"
echo ""
echo "Waiting for table to become active..."

# Wait for table to become active
aws_cmd dynamodb wait table-exists \
    --region $REGION \
    --table-name $TABLE_NAME

if [ $? -ne 0 ]; then
    echo "✗ Table creation failed or timed out"
    exit 1
fi

echo "✓ Table is now active"
echo ""

# Verify table creation
echo "Verifying table..."
aws_cmd dynamodb describe-table \
    --region $REGION \
    --table-name $TABLE_NAME \
    --query 'Table.[TableName,TableStatus,KeySchema]' \
    --output json

echo ""
echo "✓ DynamoDB table setup complete!"
echo ""
echo "Table Name: $TABLE_NAME"
echo "Partition Key: userId (String)"
echo "Sort Key: secretName (String)"
echo ""
echo "Row-level security: Each user can only access their own secrets"
echo ""
echo "Next steps:"
echo "1. Update Lambda IAM role to allow DynamoDB operations on this table"
echo "2. Use table name '$TABLE_NAME' in Lambda environment variable MY_BUYS_SECRETS_TABLE"

