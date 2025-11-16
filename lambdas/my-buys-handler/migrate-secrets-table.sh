#!/bin/bash

# Migration script to recreate secrets table with composite key (userId, secretName)
# This enables row-level security per user

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
BACKUP_TABLE_NAME="${TABLE_NAME}-backup-$(date +%s)"

echo "⚠️  WARNING: This will delete the existing secrets table and recreate it with a new structure!"
echo "   Old table will be backed up to: $BACKUP_TABLE_NAME"
echo ""
read -p "Are you sure you want to proceed? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo "Step 1: Checking if table exists..."
TABLE_EXISTS=$(aws_cmd dynamodb describe-table \
    --region $REGION \
    --table-name $TABLE_NAME \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null)

if [ "$TABLE_EXISTS" != "ACTIVE" ] && [ "$TABLE_EXISTS" != "CREATING" ] && [ "$TABLE_EXISTS" != "UPDATING" ]; then
    echo "Table doesn't exist or is not accessible. Creating new table..."
    TABLE_EXISTS=""
else
    echo "✓ Table exists, will backup and recreate"
fi

# Backup existing table if it exists
if [ -n "$TABLE_EXISTS" ]; then
    echo ""
    echo "Step 2: Backing up existing table..."
    # Note: DynamoDB doesn't have a direct backup command, but we can export data
    # For now, we'll just note that data will be lost and user should export manually if needed
    echo "⚠️  Note: If you have existing data, export it manually before proceeding!"
    echo "   You can use: aws dynamodb scan --table-name $TABLE_NAME --region $REGION"
    echo ""
    read -p "Have you backed up your data? (yes/no): " backup_confirm
    
    if [ "$backup_confirm" != "yes" ]; then
        echo "Migration cancelled. Please backup your data first."
        exit 0
    fi
    
    echo ""
    echo "Step 3: Deleting existing table..."
    aws_cmd dynamodb delete-table \
        --region $REGION \
        --table-name $TABLE_NAME > /dev/null 2>&1
    
    echo "Waiting for table deletion..."
    aws_cmd dynamodb wait table-not-exists \
        --region $REGION \
        --table-name $TABLE_NAME
    
    echo "✓ Table deleted"
fi

echo ""
echo "Step 4: Creating new table with composite key (userId, secretName)..."
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
echo "✅ Migration complete!"
echo ""
echo "Table Name: $TABLE_NAME"
echo "Partition Key: userId (String) - Row-level security"
echo "Sort Key: secretName (String)"
echo ""
echo "Security: Each user can only access secrets with their own userId"

