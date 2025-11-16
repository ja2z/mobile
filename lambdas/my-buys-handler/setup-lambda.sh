#!/bin/bash

# Setup Lambda Function Script
# This script creates the IAM role and Lambda function for my-buys-handler

set -e  # Exit on any error

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
FUNCTION_NAME="my-buys-handler"
ROLE_NAME="mobile-my-buys-lambda-role"
REGION="us-west-2"
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)

echo "=========================================="
echo "My Buys Lambda Setup"
echo "=========================================="
echo "Function Name: $FUNCTION_NAME"
echo "Role Name: $ROLE_NAME"
echo "Region: $REGION"
echo "Account ID: $ACCOUNT_ID"
echo ""

# Verify authentication
echo "Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

# Step 1: Create IAM Role
echo "Step 1: Creating IAM Role..."
if aws_cmd iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1; then
    echo "  ✓ IAM role already exists: $ROLE_NAME"
else
    echo "  Creating IAM role: $ROLE_NAME"
    
    # Create trust policy document
    TRUST_POLICY='{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }'
    
    aws_cmd iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --description "Execution role for my-buys-handler Lambda function"
    
    echo "  ✓ IAM role created"
    
    # Attach basic Lambda execution policy
    echo "  Attaching basic Lambda execution policy..."
    aws_cmd iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    
    echo "  ✓ Basic execution policy attached"
    
    # Create inline policy for My Buys permissions
    echo "  Creating inline policy for My Buys permissions..."
    POLICY_DOC='{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:Query"
                ],
                "Resource": [
                    "arn:aws:dynamodb:'"$REGION"':*:table/mobile-my-buys-applets",
                    "arn:aws:dynamodb:'"$REGION"':*:table/mobile-my-buys-applets/index/*",
                    "arn:aws:dynamodb:'"$REGION"':*:table/mobile-user-activity",
                    "arn:aws:dynamodb:'"$REGION"':*:table/mobile-user-activity/index/*",
                    "arn:aws:dynamodb:'"$REGION"':*:table/mobile-users",
                    "arn:aws:dynamodb:'"$REGION"':*:table/mobile-users/index/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "kms:Encrypt",
                    "kms:Decrypt",
                    "kms:DescribeKey"
                ],
                "Resource": [
                    "arn:aws:kms:'"$REGION"':*:key/*",
                    "arn:aws:kms:'"$REGION"':*:alias/mobile-my-buys-secrets"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "secretsmanager:GetSecretValue"
                ],
                "Resource": [
                    "arn:aws:secretsmanager:'"$REGION"':*:secret:mobile-app/jwt-secret*"
                ]
            }
        ]
    }'
    
    aws_cmd iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name mobile-my-buys-lambda-policy \
        --policy-document "$POLICY_DOC"
    
    echo "  ✓ Inline policy created"
    
    # Wait for role to be ready
    echo "  Waiting for role to be ready..."
    sleep 5
fi
echo ""

# Step 2: Build Lambda
echo "Step 2: Building Lambda function..."
if [ ! -f "my-buys-handler.zip" ]; then
    echo "  Building Lambda package..."
    ./build-lambda.sh
    echo "  ✓ Lambda package built"
else
    echo "  ✓ Lambda package already exists (skipping build)"
    echo "  To rebuild, run: ./build-lambda.sh"
fi
echo ""

# Step 3: Create Lambda Function
echo "Step 3: Creating Lambda function..."
if aws_cmd lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
    echo "  ✓ Lambda function already exists: $FUNCTION_NAME"
    echo "  To update code, run: aws lambda update-function-code --function-name $FUNCTION_NAME --zip-file fileb://my-buys-handler.zip --region $REGION"
else
    echo "  Creating Lambda function: $FUNCTION_NAME"
    
    ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
    
    aws_cmd lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime nodejs20.x \
        --role "$ROLE_ARN" \
        --handler index.handler \
        --zip-file fileb://my-buys-handler.zip \
        --timeout 30 \
        --memory-size 512 \
        --environment Variables="{
            MY_BUYS_TABLE=mobile-my-buys-applets,
            KMS_KEY_ALIAS=alias/mobile-my-buys-secrets,
            JWT_SECRET_NAME=mobile-app/jwt-secret,
            ACTIVITY_TABLE=mobile-user-activity
        }" \
        --region "$REGION" \
        --description "Handles CRUD operations for My Buys applets"
    
    echo "  ✓ Lambda function created"
fi
echo ""

echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Lambda Function: $FUNCTION_NAME"
echo "IAM Role: $ROLE_NAME"
echo "Region: $REGION"
echo ""
echo "Next steps:"
echo "1. Verify the Lambda function in AWS Console"
echo "2. Test the function with a sample event"
echo "3. Ensure API Gateway is configured (run ./setup-api-gateway.sh if needed)"
echo ""

