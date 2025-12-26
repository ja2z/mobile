#!/bin/bash

# Setup Migration Lambda Function
# Creates Lambda function to migrate DynamoDB to PostgreSQL

set -e  # Exit on any error

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper to filter warnings
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

# Configuration
FUNCTION_NAME="migrate-activity-logs"
REGION="us-west-2"
ROLE_NAME="migrate-activity-logs-role"
ACCOUNT_ID="763903610969"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Setting up Migration Lambda Function"
echo "=========================================="
echo ""

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

# Step 1: Create IAM Role
echo "Step 1: Creating IAM role..."
if aws_cmd iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1; then
    echo "  ✓ IAM role already exists: $ROLE_NAME"
else
    echo "  Creating IAM role: $ROLE_NAME"
    
    # Create trust policy
    TRUST_POLICY='{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Service": "lambda.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }]
    }'
    
    aws_cmd iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --description "Role for migration Lambda function" \
        > /dev/null
    
    echo "  ✓ IAM role created"
    
    # Wait for role to be ready
    sleep 5
fi

# Create inline policy
echo "  Creating inline policy..."
POLICY_DOC='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/mobile-user-activity"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:mobile-app/postgres-credentials-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses"
      ],
      "Resource": "*"
    }
  ]
}'

aws_cmd iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "migrate-activity-logs-policy" \
    --policy-document "$POLICY_DOC" \
    > /dev/null

echo "  ✓ Inline policy created"
echo ""

# Step 2: Get VPC configuration (same as other Lambdas)
echo "Step 2: Getting VPC configuration..."
DEFAULT_VPC_ID=$(aws_cmd ec2 describe-vpcs \
    --region "$REGION" \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text)

SUBNET_1=$(aws_cmd ec2 describe-subnets \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC_ID" "Name=availability-zone,Values=us-west-2a" \
    --query 'Subnets[0].SubnetId' \
    --output text)

SUBNET_2=$(aws_cmd ec2 describe-subnets \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC_ID" "Name=availability-zone,Values=us-west-2b" \
    --query 'Subnets[0].SubnetId' \
    --output text)

LAMBDA_SG_ID=$(aws_cmd ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=lambda-activity-logging-sg" "Name=vpc-id,Values=$DEFAULT_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

echo "  ✓ VPC: $DEFAULT_VPC_ID"
echo "  ✓ Subnets: $SUBNET_1, $SUBNET_2"
echo "  ✓ Security Group: $LAMBDA_SG_ID"
echo ""

# Step 3: Build Lambda
echo "Step 3: Building Lambda function..."
if [ ! -f "migrate-activity-logs.zip" ]; then
    echo "  Building Lambda package..."
    ./build-lambda.sh
    echo "  ✓ Lambda package built"
else
    echo "  ✓ Lambda package already exists (skipping build)"
fi
echo ""

# Step 4: Create Lambda Function
echo "Step 4: Creating Lambda function..."
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if aws_cmd lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
    echo "  ✓ Lambda function already exists: $FUNCTION_NAME"
    echo "  Updating function code..."
    aws_cmd lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --zip-file fileb://migrate-activity-logs.zip \
        > /dev/null
    
    # Update configuration
    aws_cmd lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --timeout 900 \
        --memory-size 1024 \
        --vpc-config "SubnetIds=$SUBNET_1,$SUBNET_2,SecurityGroupIds=$LAMBDA_SG_ID" \
        --environment "Variables={ACTIVITY_TABLE=mobile-user-activity,POSTGRES_SECRET_NAME=mobile-app/postgres-credentials,POSTGRES_DATABASE=mobile_app}" \
        > /dev/null
    
    echo "  ✓ Lambda function updated"
else
    echo "  Creating Lambda function: $FUNCTION_NAME"
    
    aws_cmd lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime nodejs20.x \
        --role "$ROLE_ARN" \
        --handler index.handler \
        --zip-file fileb://migrate-activity-logs.zip \
        --timeout 900 \
        --memory-size 1024 \
        --vpc-config "SubnetIds=$SUBNET_1,$SUBNET_2,SecurityGroupIds=$LAMBDA_SG_ID" \
        --environment "Variables={ACTIVITY_TABLE=mobile-user-activity,POSTGRES_SECRET_NAME=mobile-app/postgres-credentials,POSTGRES_DATABASE=mobile_app}" \
        --region "$REGION" \
        --description "One-time migration: DynamoDB activity logs to PostgreSQL" \
        > /dev/null
    
    echo "  ✓ Lambda function created"
fi
echo ""

echo "=========================================="
echo "✅ Migration Lambda Setup Complete!"
echo "=========================================="
echo ""
echo "To run the migration, invoke the Lambda:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION response.json"
echo ""

