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

# Configuration
TABLE_NAME="mobile-phone-verifications"
REGION="us-west-2"

echo "=========================================="
echo "Phone Verification DynamoDB Setup"
echo "=========================================="
echo "Table Name: $TABLE_NAME"
echo "Region: $REGION"
echo ""

# Check if table already exists
if aws_cmd dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" > /dev/null 2>&1; then
    echo "✓ Table $TABLE_NAME already exists"
    echo ""
    echo "Table details:"
    aws_cmd dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" --query 'Table.[TableName,TableStatus,AttributeDefinitions[*].[AttributeName,AttributeType]]' --output table
    exit 0
fi

echo "Creating DynamoDB table: $TABLE_NAME"
echo ""

# Create table (without TTL - must be enabled separately)
aws_cmd dynamodb create-table \
    --region "$REGION" \
    --table-name "$TABLE_NAME" \
    --attribute-definitions \
        AttributeName=verificationId,AttributeType=S \
        AttributeName=phoneNumber,AttributeType=S \
        AttributeName=email,AttributeType=S \
    --key-schema \
        AttributeName=verificationId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --global-secondary-indexes '[
        {
            "IndexName": "phone-email-index",
            "KeySchema": [
                {"AttributeName": "phoneNumber", "KeyType": "HASH"},
                {"AttributeName": "email", "KeyType": "RANGE"}
            ],
            "Projection": {"ProjectionType": "ALL"}
        }
    ]'

echo ""
echo "✓ Table creation initiated"
echo "Waiting for table to become active..."

# Wait for table to become active
aws_cmd dynamodb wait table-exists \
    --table-name "$TABLE_NAME" \
    --region "$REGION"

echo "✓ Table is now active"
echo ""

# Enable TTL (must be done after table is created)
echo "Enabling TTL on expiresAt attribute..."
aws_cmd dynamodb update-time-to-live \
    --region "$REGION" \
    --table-name "$TABLE_NAME" \
    --time-to-live-specification "Enabled=true,AttributeName=expiresAt"

echo "✓ TTL enabled"
echo ""

# Display table details
echo "Table details:"
aws_cmd dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --query 'Table.[TableName,TableStatus,AttributeDefinitions[*].[AttributeName,AttributeType],GlobalSecondaryIndexes[*].[IndexName,KeySchema[*].[AttributeName,KeyType]]]' \
    --output table

echo ""
echo "✅ DynamoDB table setup complete!"
echo "📍 Table: $TABLE_NAME"
echo "   TTL enabled on: expiresAt"
echo "   GSI: phone-email-index (phoneNumber + email)"

