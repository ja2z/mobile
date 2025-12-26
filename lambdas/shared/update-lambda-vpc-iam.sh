#!/bin/bash

# Update Lambda VPC Configuration and IAM Permissions for PostgreSQL Access
# This script updates all Lambda functions that use activity logging to:
# 1. Configure VPC settings (subnets and security group)
# 2. Add Secrets Manager permissions for PostgreSQL credentials

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
LAMBDA_SG_NAME="lambda-activity-logging-sg"
SECRET_ARN="arn:aws:secretsmanager:us-west-2:*:secret:mobile-app/postgres-credentials-*"

# Lambda functions that need updates
LAMBDA_FUNCTIONS=(
    "admin-handler"
    "mobile-auth-handler"
    "generateSigmaEmbedURL"
    "my-buys-handler"
)

echo "=========================================="
echo "Updating Lambda VPC Configuration & IAM"
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

# Get default VPC and subnets
echo "📋 Getting VPC and subnet information..."
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
    --filters "Name=group-name,Values=$LAMBDA_SG_NAME" "Name=vpc-id,Values=$DEFAULT_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

echo "✓ VPC: $DEFAULT_VPC_ID"
echo "✓ Subnets: $SUBNET_1, $SUBNET_2"
echo "✓ Lambda Security Group: $LAMBDA_SG_ID"
echo ""

# Update each Lambda function
for FUNCTION_NAME in "${LAMBDA_FUNCTIONS[@]}"; do
    echo "=========================================="
    echo "Processing: $FUNCTION_NAME"
    echo "=========================================="
    
    # Check if function exists
    if ! aws_cmd lambda get-function-configuration \
        --region "$REGION" \
        --function-name "$FUNCTION_NAME" > /dev/null 2>&1; then
        echo "⚠️  Function $FUNCTION_NAME not found, skipping..."
        echo ""
        continue
    fi
    
    # Step 1: Update IAM Permissions (must be done before VPC config)
    echo "Step 1: Updating IAM permissions..."
    
    # Get Lambda role
    ROLE_ARN=$(aws_cmd lambda get-function-configuration \
        --region "$REGION" \
        --function-name "$FUNCTION_NAME" \
        --query 'Role' \
        --output text)
    
    ROLE_NAME=$(echo "$ROLE_ARN" | sed 's/.*\///')
    echo "  Role: $ROLE_NAME"
    
    # List inline policies
    POLICIES=$(aws_cmd iam list-role-policies \
        --role-name "$ROLE_NAME" \
        --query 'PolicyNames' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$POLICIES" ] || [ "$POLICIES" = "None" ]; then
        echo "  ⚠️  No inline policies found, creating new one..."
        POLICY_NAME="${FUNCTION_NAME}-policy"
    else
        # Use the first policy or look for one with "policy" in the name
        POLICY_NAME=$(echo "$POLICIES" | awk '{print $1}')
        echo "  Using policy: $POLICY_NAME"
    fi
    
    # Get current policy
    POLICY_DOC=$(aws_cmd iam get-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "$POLICY_NAME" \
        --output json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(json.dumps(data.get('PolicyDocument', {})))
except:
    print('{}')
" || echo '{}')
    
    if [ "$POLICY_DOC" = "{}" ]; then
        echo "  ⚠️  Could not get policy, creating new one..."
        POLICY_DOC='{"Version":"2012-10-17","Statement":[]}'
    fi
    
    # Update policy to add Secrets Manager permission and VPC permissions
    UPDATED_POLICY=$(POLICY_DOC_JSON="$POLICY_DOC" SECRET_ARN="$SECRET_ARN" python3 << 'PYTHON_SCRIPT'
import json, os, sys

policy = json.loads(os.environ['POLICY_DOC_JSON'])
secret_arn = os.environ['SECRET_ARN']

# Find or create secretsmanager statement
found_secrets = False
for statement in policy.get('Statement', []):
    actions = statement.get('Action', [])
    if isinstance(actions, str):
        actions = [actions]
    
    if 'secretsmanager:GetSecretValue' in actions:
        resources = statement.get('Resource', [])
        if isinstance(resources, str):
            resources = [resources]
        
        if secret_arn not in resources:
            resources.append(secret_arn)
            statement['Resource'] = resources
            found_secrets = True
        else:
            found_secrets = True
        break

if not found_secrets:
    # Create new secretsmanager statement
    new_statement = {
        "Effect": "Allow",
        "Action": ["secretsmanager:GetSecretValue"],
        "Resource": [secret_arn]
    }
    if 'Statement' not in policy:
        policy['Statement'] = []
    policy['Statement'].append(new_statement)

# Find or create EC2 VPC statement
found_ec2 = False
for statement in policy.get('Statement', []):
    actions = statement.get('Action', [])
    if isinstance(actions, str):
        actions = [actions]
    
    if 'ec2:CreateNetworkInterface' in actions:
        found_ec2 = True
        break

if not found_ec2:
    # Create new EC2 VPC statement
    ec2_statement = {
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
    if 'Statement' not in policy:
        policy['Statement'] = []
    policy['Statement'].append(ec2_statement)

print(json.dumps(policy))
PYTHON_SCRIPT
)
    
    # Update policy
    echo "$UPDATED_POLICY" > /tmp/updated-policy.json
    aws_cmd iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "$POLICY_NAME" \
        --policy-document file:///tmp/updated-policy.json \
        > /dev/null
    
    echo "  ✓ IAM policy updated with Secrets Manager and VPC permissions"
    echo "  ⏳ Waiting for IAM permissions to propagate..."
    for i in {1..5}; do
        echo "    Checking propagation... ($i/5)"
        sleep 2
    done
    echo ""
    
    # Step 2: Update VPC Configuration
    echo "Step 2: Updating VPC configuration..."
    CURRENT_VPC=$(aws_cmd lambda get-function-configuration \
        --region "$REGION" \
        --function-name "$FUNCTION_NAME" \
        --query 'VpcConfig.VpcId' \
        --output text 2>/dev/null || echo "None")
    
    if [ "$CURRENT_VPC" = "None" ] || [ -z "$CURRENT_VPC" ]; then
        echo "  Adding VPC configuration..."
        aws_cmd lambda update-function-configuration \
            --region "$REGION" \
            --function-name "$FUNCTION_NAME" \
            --vpc-config "SubnetIds=$SUBNET_1,$SUBNET_2,SecurityGroupIds=$LAMBDA_SG_ID" \
            > /dev/null
        
        echo "  ✓ VPC configuration added"
        echo "  ⏳ Waiting for VPC update to complete (this may take 30-60 seconds)..."
        
        # Wait for update to complete
        for i in {1..30}; do
            STATUS=$(aws_cmd lambda get-function-configuration \
                --region "$REGION" \
                --function-name "$FUNCTION_NAME" \
                --query 'LastUpdateStatus' \
                --output text)
            
            if [ "$STATUS" = "Successful" ]; then
                echo "  ✓ VPC configuration update complete"
                break
            elif [ "$STATUS" = "Failed" ]; then
                echo "  ✗ VPC configuration update failed"
                break
            fi
            
            echo "  Status: $STATUS (checking again in 3 seconds...)"
            sleep 3
        done
    else
        echo "  ✓ VPC configuration already exists"
    fi
    echo ""
    
    # Step 3: Update environment variables
    echo "Step 3: Updating environment variables..."
    # Get current environment variables
    CURRENT_ENV_JSON=$(aws_cmd lambda get-function-configuration \
        --region "$REGION" \
        --function-name "$FUNCTION_NAME" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null || echo '{}')
    
    # Parse and update environment variables, then create full config
    FULL_CONFIG=$(echo "$CURRENT_ENV_JSON" | python3 << 'PYTHON_SCRIPT'
import json, sys, os
try:
    env = json.load(sys.stdin)
    if not isinstance(env, dict):
        env = {}
except:
    env = {}

# Add PostgreSQL environment variables
env['POSTGRES_SECRET_NAME'] = 'mobile-app/postgres-credentials'
env['POSTGRES_DATABASE'] = 'mobile_app'

# Create full update config
config = {
    "Environment": {
        "Variables": env
    }
}
print(json.dumps(config))
PYTHON_SCRIPT
)
    
    # Write config to temp file
    echo "$FULL_CONFIG" > /tmp/lambda-env-update.json
    
    # Update using cli-input-json
    aws_cmd lambda update-function-configuration \
        --region "$REGION" \
        --function-name "$FUNCTION_NAME" \
        --cli-input-json file:///tmp/lambda-env-update.json \
        > /dev/null
    
    rm -f /tmp/lambda-env-update.json
    
    echo "  ✓ Environment variables updated"
    echo ""
done

rm -f /tmp/updated-policy.json

# Step 4: Ensure KMS VPC endpoint exists (required for encryption/decryption)
echo ""
echo "=========================================="
echo "Step 4: Checking KMS VPC Endpoint"
echo "=========================================="
KMS_ENDPOINT_EXISTS=$(aws_cmd ec2 describe-vpc-endpoints \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC_ID" "Name=service-name,Values=com.amazonaws.us-west-2.kms" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text 2>/dev/null || echo "")

if [ -z "$KMS_ENDPOINT_EXISTS" ] || [ "$KMS_ENDPOINT_EXISTS" = "None" ]; then
    echo "⚠️  KMS VPC endpoint not found"
    echo "   Lambda functions need KMS VPC endpoint for encryption/decryption"
    echo "   Run: ./lambdas/shared/setup-kms-vpc-endpoint.sh"
    echo ""
else
    echo "✓ KMS VPC endpoint exists: $KMS_ENDPOINT_EXISTS"
fi
echo ""

echo "=========================================="
echo "✅ Lambda VPC & IAM Update Complete!"
echo "=========================================="
echo ""
echo "All Lambda functions have been updated with:"
echo "  - VPC configuration (subnets and security group)"
echo "  - Secrets Manager permissions for PostgreSQL credentials"
echo "  - Environment variables (POSTGRES_SECRET_NAME, POSTGRES_DATABASE)"
echo ""
echo "Note: Lambda functions in VPC may have increased cold start times."
echo "      Timeout has been set to 25 seconds to avoid API Gateway timeouts (29s limit)."
echo ""
echo "⚠️  IMPORTANT: Ensure KMS VPC endpoint exists for encryption/decryption:"
echo "   Run: ./lambdas/shared/setup-kms-vpc-endpoint.sh"

