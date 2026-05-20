#!/bin/bash

# Setup API Gateway route for consume-sms-token endpoint.
# SMS magic-link tokens are navigation-only and must NOT mint a session JWT.
# This endpoint accepts an SMS token + an existing session JWT (Authorization
# header) and returns the navigation metadata (app, pageId, variables) the
# token was generated for.

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

echo "🔍 Checking if consume-sms-token resource exists..."
CONSUME_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/auth/consume-sms-token'].id" \
    --output text)

if [ -z "$CONSUME_ID" ]; then
    echo "📝 Creating /auth/consume-sms-token resource..."
    CONSUME_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $AUTH_ID \
        --path-part consume-sms-token \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created resource: $CONSUME_ID"
else
    echo "✓ Resource already exists: $CONSUME_ID"
fi
echo ""

echo "📝 Setting up POST method..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $CONSUME_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

echo "✓ POST method configured"
echo ""

echo "📝 Setting up Lambda integration..."
aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $CONSUME_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ Lambda integration configured"
echo ""

echo "📝 Setting up OPTIONS method for CORS..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $CONSUME_ID \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $CONSUME_ID \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
    --region $REGION > /dev/null 2>&1

echo "✓ OPTIONS method configured"
echo ""

echo "📝 Adding Lambda permission for API Gateway..."
aws_cmd lambda add-permission \
    --function-name $LAMBDA_FUNCTION_NAME \
    --statement-id apigateway-invoke-consume-sms-token \
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
    --description "Add consume-sms-token endpoint" \
    --query 'id' \
    --output text)

echo "✓ Deployment created: $DEPLOYMENT_ID"
echo ""
echo "✅ API Gateway route setup complete!"
echo "📍 Endpoint: https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/auth/consume-sms-token"
