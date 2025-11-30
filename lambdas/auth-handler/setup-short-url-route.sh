#!/bin/bash

# Setup API Gateway route for short URL redirect endpoint
# Creates GET /v1/auth/s/{shortId} route

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

API_ID="qx7x0uioo1"
REGION="us-west-2"
ACCOUNT_ID="763903610969"
LAMBDA_FUNCTION_NAME="mobile-auth-handler"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

echo "🔍 Getting /auth resource ID..."
AUTH_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/auth`].id' \
    --output text)

if [ -z "$AUTH_ID" ]; then
    echo "❌ Error: Could not find /auth resource"
    exit 1
fi

echo "✓ Found /auth resource ID: $AUTH_ID"
echo ""

# Check if /auth/s resource exists
echo "🔍 Checking if /auth/s resource exists..."
S_RESOURCE_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/auth/s'].id" \
    --output text)

if [ -z "$S_RESOURCE_ID" ]; then
    echo "📝 Creating /auth/s resource..."
    S_RESOURCE_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $AUTH_ID \
        --path-part s \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /auth/s resource: $S_RESOURCE_ID"
else
    echo "✓ /auth/s resource already exists: $S_RESOURCE_ID"
fi
echo ""

# Check if /auth/s/{shortId} resource exists
echo "🔍 Checking if /auth/s/{shortId} resource exists..."
SHORT_ID_RESOURCE_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/auth/s/{shortId}'].id" \
    --output text)

if [ -z "$SHORT_ID_RESOURCE_ID" ]; then
    echo "📝 Creating /auth/s/{shortId} resource..."
    SHORT_ID_RESOURCE_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $S_RESOURCE_ID \
        --path-part '{shortId}' \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /auth/s/{shortId} resource: $SHORT_ID_RESOURCE_ID"
else
    echo "✓ /auth/s/{shortId} resource already exists: $SHORT_ID_RESOURCE_ID"
fi
echo ""

# Check if GET method exists
GET_METHOD=$(aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $SHORT_ID_RESOURCE_ID \
    --http-method GET \
    --region $REGION \
    --query 'httpMethod' \
    --output text 2>/dev/null || echo "None")

if [ "$GET_METHOD" == "None" ]; then
    echo "📝 Setting up GET method..."
    aws_cmd apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $SHORT_ID_RESOURCE_ID \
        --http-method GET \
        --authorization-type NONE \
        --region $REGION > /dev/null 2>&1
    echo "✓ GET method configured"
else
    echo "✓ GET method already exists"
fi
echo ""

echo "📝 Setting up Lambda integration..."
aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $SHORT_ID_RESOURCE_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ Lambda integration configured"
echo ""

echo "📝 Setting up OPTIONS method for CORS..."
OPTIONS_METHOD=$(aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $SHORT_ID_RESOURCE_ID \
    --http-method OPTIONS \
    --region $REGION \
    --query 'httpMethod' \
    --output text 2>/dev/null || echo "None")

if [ "$OPTIONS_METHOD" == "None" ]; then
    aws_cmd apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $SHORT_ID_RESOURCE_ID \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region $REGION > /dev/null 2>&1

    aws_cmd apigateway put-integration \
        --rest-api-id $API_ID \
        --resource-id $SHORT_ID_RESOURCE_ID \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region $REGION > /dev/null 2>&1

    echo "✓ OPTIONS method configured"
else
    echo "✓ OPTIONS method already exists"
fi
echo ""

echo "📝 Adding Lambda permission for API Gateway..."
aws_cmd lambda add-permission \
    --function-name $LAMBDA_FUNCTION_NAME \
    --statement-id apigateway-invoke-short-url \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    --region $REGION > /dev/null 2>&1 || echo "⚠ Warning: Permission may already exist (this is OK)"
echo ""

echo "🚀 Deploying API Gateway..."
DEPLOYMENT_ID=$(aws_cmd apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v1 \
    --region $REGION \
    --description "Add short URL redirect endpoint /auth/s/{shortId}" \
    --query 'id' \
    --output text)

echo "✓ Deployment created: $DEPLOYMENT_ID"
echo ""
echo "✅ API Gateway route setup complete!"
echo "📍 Endpoint: https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/auth/s/{shortId}"
echo "   Example: https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/auth/s/abc123"

