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
TABLE_NAME="mobile-my-buys-applets"

echo "Creating DynamoDB table: $TABLE_NAME"
echo "Region: $REGION"
echo ""

# Create the table
echo "Creating table..."
aws_cmd dynamodb create-table \
    --region $REGION \
    --table-name $TABLE_NAME \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=appletId,AttributeType=S \
        AttributeName=createdAt,AttributeType=N \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=appletId,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --global-secondary-indexes \
    '[
        {
            "IndexName": "userId-createdAt-index",
            "KeySchema": [
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "createdAt", "KeyType": "RANGE"}
            ],
            "Projection": {"ProjectionType": "ALL"}
        }
    ]'

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
    --query 'Table.[TableName,TableStatus,KeySchema,GlobalSecondaryIndexes]' \
    --output json

echo ""
echo "✓ DynamoDB table setup complete!"
echo ""
echo "Table Name: $TABLE_NAME"
echo "Partition Key: userId (String)"
echo "Sort Key: appletId (String)"
echo "GSI: userId-createdAt-index"
echo ""
echo "Next steps:"
echo "1. Update Lambda IAM role to allow DynamoDB operations on this table"
echo "2. Use table name '$TABLE_NAME' in Lambda environment variable MY_BUYS_TABLE"

