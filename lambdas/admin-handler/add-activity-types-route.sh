#!/bin/bash

# Add /admin/activity/types route to API Gateway
# This script creates the new route for fetching unique activity types

set -e  # Exit on any error

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

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

# Configuration
API_ID="qx7x0uioo1"
REGION="us-west-2"
LAMBDA_FUNCTION_NAME="admin-handler"
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

echo "API Gateway ID: $API_ID"
echo "Region: $REGION"
echo "Lambda Function: $LAMBDA_FUNCTION_NAME"
echo "Lambda ARN: $LAMBDA_ARN"
echo ""

# Get /admin/activity resource ID
ACTIVITY_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/admin/activity`].id' \
    --output text)

if [ -z "$ACTIVITY_ID" ] || [ "$ACTIVITY_ID" == "None" ]; then
    echo "✗ ERROR: Could not find /admin/activity resource"
    exit 1
fi

echo "✓ Found /admin/activity resource: $ACTIVITY_ID"
echo ""

# Check if /admin/activity/types resource exists
TYPES_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/admin/activity/types`].id' \
    --output text)

if [ -z "$TYPES_ID" ] || [ "$TYPES_ID" == "None" ]; then
    echo "📝 Creating /admin/activity/types resource..."
    TYPES_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ACTIVITY_ID \
        --path-part types \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /admin/activity/types resource: $TYPES_ID"
else
    echo "✓ /admin/activity/types resource already exists: $TYPES_ID"
fi
echo ""

# Check if GET method exists
GET_METHOD=$(aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $TYPES_ID \
    --http-method GET \
    --region $REGION \
    --query 'httpMethod' \
    --output text 2>/dev/null || echo "None")

if [ "$GET_METHOD" == "None" ]; then
    echo "📝 Creating GET method for /admin/activity/types..."
    aws_cmd apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $TYPES_ID \
        --http-method GET \
        --authorization-type NONE \
        --region $REGION \
        --no-api-key-required
    echo "✓ Created GET method"
else
    echo "✓ GET method already exists"
fi
echo ""

# Set up Lambda integration
echo "📝 Configuring Lambda integration..."
aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $TYPES_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION
echo "✓ Lambda integration configured"
echo ""

# Ensure Lambda has permission to be invoked by API Gateway
echo "📝 Checking Lambda permissions..."
POLICY_EXISTS=$(aws_cmd lambda get-policy \
    --function-name $LAMBDA_FUNCTION_NAME \
    --region $REGION \
    --query 'Policy' \
    --output text 2>/dev/null | grep -q "apigateway.amazonaws.com" && echo "yes" || echo "no")

if [ "$POLICY_EXISTS" == "no" ]; then
    echo "📝 Adding API Gateway invoke permission..."
    aws_cmd lambda add-permission \
        --function-name $LAMBDA_FUNCTION_NAME \
        --statement-id "apigateway-${API_ID}-types" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
        --region $REGION 2>/dev/null || echo "  (Permission may already exist)"
    echo "✓ Lambda permission configured"
else
    echo "✓ Lambda permission already exists"
fi
echo ""

# Deploy to v1 stage
echo "🚀 Deploying API Gateway stage..."
DEPLOYMENT_ID=$(aws_cmd apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v1 \
    --region $REGION \
    --description "Add /admin/activity/types endpoint" \
    --query 'id' \
    --output text)
echo "✓ Deployment created: $DEPLOYMENT_ID"
echo ""

echo "✅ Route setup complete!"
echo ""
echo "📋 Summary:"
echo "   Route: GET /admin/activity/types"
echo "   Resource ID: $TYPES_ID"
echo "   Lambda: $LAMBDA_FUNCTION_NAME"
echo "   Deployment: $DEPLOYMENT_ID"
echo ""
echo "🧪 Test the endpoint:"
echo "   curl https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/admin/activity/types"

