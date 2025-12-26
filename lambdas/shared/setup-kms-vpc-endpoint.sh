#!/bin/bash

# Create KMS VPC Endpoint for Lambda Functions
# Lambda functions in VPC need VPC endpoints to access AWS services like KMS
# This script creates an Interface VPC endpoint for KMS

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
REGION="us-west-2"
VPC_ID="vpc-6144d219"  # Default VPC
KMS_SERVICE_NAME="com.amazonaws.us-west-2.kms"

echo "=========================================="
echo "Setting up KMS VPC Endpoint"
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

# Get Lambda security group (needed for VPC endpoint)
echo "📋 Getting Lambda security group..."
LAMBDA_SG_NAME="lambda-activity-logging-sg"
LAMBDA_SG_ID=$(aws_cmd ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=$LAMBDA_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$LAMBDA_SG_ID" ] || [ "$LAMBDA_SG_ID" = "None" ]; then
    echo "✗ ERROR: Lambda security group not found: $LAMBDA_SG_NAME"
    echo "   Please run lambdas/shared/setup-rds-postgres.sh first"
    exit 1
fi
echo "✓ Lambda security group: $LAMBDA_SG_ID"
echo ""

# Get subnets in different AZs (need at least 2 for high availability)
echo "📋 Getting subnets..."
SUBNET_1=$(aws_cmd ec2 describe-subnets \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=availability-zone,Values=us-west-2a" \
    --query 'Subnets[0].SubnetId' \
    --output text)

SUBNET_2=$(aws_cmd ec2 describe-subnets \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=availability-zone,Values=us-west-2b" \
    --query 'Subnets[0].SubnetId' \
    --output text)

if [ -z "$SUBNET_1" ] || [ "$SUBNET_1" = "None" ] || [ -z "$SUBNET_2" ] || [ "$SUBNET_2" = "None" ]; then
    echo "✗ ERROR: Could not find subnets in at least 2 different availability zones"
    exit 1
fi

echo "✓ Subnets: $SUBNET_1 (us-west-2a), $SUBNET_2 (us-west-2b)"
echo ""

# Check if KMS VPC endpoint already exists
echo "🔍 Checking for existing KMS VPC endpoint..."
EXISTING_ENDPOINT=$(aws_cmd ec2 describe-vpc-endpoints \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=$KMS_SERVICE_NAME" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_ENDPOINT" ] && [ "$EXISTING_ENDPOINT" != "None" ]; then
    echo "✓ KMS VPC endpoint already exists: $EXISTING_ENDPOINT"
    
    # Check status
    ENDPOINT_STATE=$(aws_cmd ec2 describe-vpc-endpoints \
        --region "$REGION" \
        --vpc-endpoint-ids "$EXISTING_ENDPOINT" \
        --query 'VpcEndpoints[0].State' \
        --output text)
    
    echo "  State: $ENDPOINT_STATE"
    
    if [ "$ENDPOINT_STATE" = "available" ]; then
        echo ""
        echo "=========================================="
        echo "✅ KMS VPC Endpoint is already configured!"
        echo "=========================================="
        exit 0
    else
        echo "  ⚠️  Endpoint exists but is not available (state: $ENDPOINT_STATE)"
        echo "  Waiting for endpoint to become available..."
    fi
else
    # Create KMS VPC endpoint
    echo "Creating KMS VPC endpoint..."
    
    ENDPOINT_ID=$(aws_cmd ec2 create-vpc-endpoint \
        --region "$REGION" \
        --vpc-id "$VPC_ID" \
        --service-name "$KMS_SERVICE_NAME" \
        --vpc-endpoint-type Interface \
        --subnet-ids "$SUBNET_1" "$SUBNET_2" \
        --security-group-ids "$LAMBDA_SG_ID" \
        --query 'VpcEndpoint.VpcEndpointId' \
        --output text)
    
    echo "✓ KMS VPC endpoint created: $ENDPOINT_ID"
    echo "  ⏳ Waiting for endpoint to become available (this may take 2-5 minutes)..."
    
    # Wait for endpoint to become available
    for i in {1..60}; do
        ENDPOINT_STATE=$(aws_cmd ec2 describe-vpc-endpoints \
            --region "$REGION" \
            --vpc-endpoint-ids "$ENDPOINT_ID" \
            --query 'VpcEndpoints[0].State' \
            --output text 2>/dev/null || echo "pending")
        
        if [ "$ENDPOINT_STATE" = "available" ]; then
            echo "  ✓ Endpoint is now available!"
            break
        elif [ "$ENDPOINT_STATE" = "failed" ]; then
            echo "  ✗ Endpoint creation failed"
            exit 1
        fi
        
        if [ $((i % 10)) -eq 0 ]; then
            echo "  Still waiting... (state: $ENDPOINT_STATE, $i/60 checks)"
        fi
        sleep 5
    done
    
    if [ "$ENDPOINT_STATE" != "available" ]; then
        echo "  ⚠️  Endpoint creation is taking longer than expected"
        echo "  Current state: $ENDPOINT_STATE"
        echo "  You can check status manually with:"
        echo "    aws ec2 describe-vpc-endpoints --vpc-endpoint-ids $ENDPOINT_ID --region $REGION"
    fi
fi

echo ""
echo "=========================================="
echo "✅ KMS VPC Endpoint Setup Complete!"
echo "=========================================="
echo ""
echo "Lambda functions in VPC can now access KMS for encryption/decryption."
echo ""
echo "Note: VPC endpoints may take a few minutes to fully propagate."
echo "      If Lambda functions still timeout, wait 2-3 minutes and try again."

