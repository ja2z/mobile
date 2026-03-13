#!/bin/bash

# Add GET /v1/applets/built-in route to API Gateway
# Required for BuiltInAppletsService to fetch applets

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

echo "🔐 Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

API_ID="qx7x0uioo1"
REGION="us-west-2"
LAMBDA_FUNCTION_NAME="admin-handler"
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

# Get root resource ID
ROOT_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/`].id' \
    --output text)

if [ -z "$ROOT_ID" ] || [ "$ROOT_ID" == "None" ]; then
    echo "✗ ERROR: Could not find root resource"
    exit 1
fi

# Create /applets resource if needed
APPLETS_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/applets`].id' \
    --output text)

if [ -z "$APPLETS_ID" ] || [ "$APPLETS_ID" == "None" ]; then
    echo "📝 Creating /applets resource..."
    APPLETS_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ROOT_ID \
        --path-part applets \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /applets: $APPLETS_ID"
else
    echo "✓ /applets exists: $APPLETS_ID"
fi

# Create /applets/built-in resource if needed
BUILTIN_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/applets/built-in`].id' \
    --output text)

if [ -z "$BUILTIN_ID" ] || [ "$BUILTIN_ID" == "None" ]; then
    echo "📝 Creating /applets/built-in resource..."
    BUILTIN_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $APPLETS_ID \
        --path-part built-in \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /applets/built-in: $BUILTIN_ID"
else
    echo "✓ /applets/built-in exists: $BUILTIN_ID"
fi

# Create GET method if needed
GET_EXISTS=$(aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $BUILTIN_ID \
    --http-method GET \
    --region $REGION \
    --query 'httpMethod' \
    --output text 2>/dev/null || echo "None")

if [ "$GET_EXISTS" == "None" ]; then
    echo "📝 Creating GET method..."
    aws_cmd apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $BUILTIN_ID \
        --http-method GET \
        --authorization-type NONE \
        --region $REGION \
        --no-api-key-required
    echo "✓ GET method created"
fi

# Add Lambda permission for API Gateway to invoke
echo "📝 Adding Lambda invoke permission..."
aws_cmd lambda add-permission \
    --function-name $LAMBDA_FUNCTION_NAME \
    --statement-id "apigateway-applets-built-in" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/GET/applets/built-in" \
    --region $REGION 2>/dev/null && echo "✓ Permission added" || echo "  (Permission may already exist)"

# Lambda integration
aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $BUILTIN_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION
echo "✓ Lambda integration configured"

# Deploy
aws_cmd apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v1 \
    --region $REGION \
    --description "Add /applets/built-in endpoint" \
    --query 'id' \
    --output text > /dev/null
echo "✓ Deployed"
echo ""
echo "✅ GET /v1/applets/built-in is ready"
echo "   curl -H 'Authorization: Bearer <token>' https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/applets/built-in"
