#!/bin/bash

# Setup DynamoDB table for short URL mappings

set -e

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
TABLE_NAME="mobile-short-urls"

echo "Creating DynamoDB table: $TABLE_NAME"
echo "Region: $REGION"
echo ""

# Check if table already exists
TABLE_EXISTS=$(aws_cmd dynamodb describe-table \
    --table-name $TABLE_NAME \
    --region $REGION \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$TABLE_EXISTS" != "NOT_FOUND" ]; then
    echo "⚠️  Table $TABLE_NAME already exists"
    echo "   Status: $TABLE_EXISTS"
    echo ""
    echo "If you want to recreate it, delete it first:"
    echo "   aws dynamodb delete-table --table-name $TABLE_NAME --region $REGION"
    exit 0
fi

# Create the table
echo "Creating table..."
aws_cmd dynamodb create-table \
    --region $REGION \
    --table-name $TABLE_NAME \
    --attribute-definitions \
        AttributeName=shortId,AttributeType=S \
    --key-schema \
        AttributeName=shortId,KeyType=HASH \
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

# Enable TTL on expiresAt attribute
echo "Enabling TTL on expiresAt attribute..."
aws_cmd dynamodb update-time-to-live \
    --region $REGION \
    --table-name $TABLE_NAME \
    --time-to-live-specification \
        "Enabled=true,AttributeName=expiresAt"

if [ $? -eq 0 ]; then
    echo "✓ TTL enabled on expiresAt attribute"
else
    echo "⚠️  Warning: Failed to enable TTL (table may still be initializing)"
    echo "   You can enable it later with:"
    echo "   aws dynamodb update-time-to-live --table-name $TABLE_NAME --time-to-live-specification 'Enabled=true,AttributeName=expiresAt' --region $REGION"
fi

echo ""
echo "✅ DynamoDB table setup complete!"
echo "📋 Table: $TABLE_NAME"
echo "📍 Region: $REGION"
echo "🔑 Partition Key: shortId (String)"
echo "⏰ TTL: expiresAt (auto-cleanup after expiration)"

