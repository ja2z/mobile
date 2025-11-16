#!/bin/bash

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

# Configuration
API_ID="qx7x0uioo1"
REGION="us-west-2"
LAMBDA_FUNCTION_NAME="my-buys-handler"
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)

echo "API Gateway ID: $API_ID"
echo "Region: $REGION"
echo "Lambda Function: $LAMBDA_FUNCTION_NAME"
echo "Account ID: $ACCOUNT_ID"
echo ""

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

echo "Root resource ID: $ROOT_ID"
echo ""

# Check if /my-buys resource exists (without /v1 prefix - stage handles that)
# Similar to how /admin resources are structured
MY_BUYS_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/my-buys`].id' \
    --output text)

if [ -z "$MY_BUYS_ID" ] || [ "$MY_BUYS_ID" == "None" ]; then
    echo "Creating /my-buys resource..."
    MY_BUYS_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ROOT_ID \
        --path-part my-buys \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /my-buys resource: $MY_BUYS_ID"
else
    echo "✓ /my-buys resource already exists: $MY_BUYS_ID"
fi
echo ""

# Check if /my-buys/applets resource exists
APPLETS_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/my-buys/applets`].id' \
    --output text)

if [ -z "$APPLETS_ID" ] || [ "$APPLETS_ID" == "None" ]; then
    echo "Creating /my-buys/applets resource..."
    APPLETS_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $MY_BUYS_ID \
        --path-part applets \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /my-buys/applets resource: $APPLETS_ID"
else
    echo "✓ /my-buys/applets resource already exists: $APPLETS_ID"
fi
echo ""

# Lambda ARN
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

# Create POST /my-buys/applets (create applet)
# Note: With stage 'v1', URL /v1/my-buys/applets maps to resource /my-buys/applets
echo "Setting up POST /my-buys/applets..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $APPLETS_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $APPLETS_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ POST /my-buys/applets configured"
echo ""

# Create GET /my-buys/applets (list applets)
echo "Setting up GET /my-buys/applets..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $APPLETS_ID \
    --http-method GET \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $APPLETS_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ GET /my-buys/applets configured"
echo ""

# Create POST /my-buys/applets/test (test configuration)
echo "Setting up POST /my-buys/applets/test..."
TEST_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/my-buys/applets/test'].id" \
    --output text)

if [ -z "$TEST_ID" ] || [ "$TEST_ID" == "None" ]; then
    TEST_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $APPLETS_ID \
        --path-part test \
        --region $REGION \
        --query 'id' \
        --output text)
fi

aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $TEST_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $TEST_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ POST /my-buys/applets/test configured"
echo ""

# Create /my-buys/applets/{appletId} resource
echo "Setting up /my-buys/applets/{appletId} resource..."
APPLET_ID_RESOURCE=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/my-buys/applets/{appletId}'].id" \
    --output text)

if [ -z "$APPLET_ID_RESOURCE" ] || [ "$APPLET_ID_RESOURCE" == "None" ]; then
    APPLET_ID_RESOURCE=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $APPLETS_ID \
        --path-part '{appletId}' \
        --region $REGION \
        --query 'id' \
        --output text)
fi

echo "✓ /my-buys/applets/{appletId} resource: $APPLET_ID_RESOURCE"
echo ""

# Create PUT /my-buys/applets/{appletId} (update applet)
echo "Setting up PUT /my-buys/applets/{appletId}..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $APPLET_ID_RESOURCE \
    --http-method PUT \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $APPLET_ID_RESOURCE \
    --http-method PUT \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ PUT /my-buys/applets/{appletId} configured"
echo ""

# Create DELETE /my-buys/applets/{appletId} (delete applet)
echo "Setting up DELETE /my-buys/applets/{appletId}..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $APPLET_ID_RESOURCE \
    --http-method DELETE \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $APPLET_ID_RESOURCE \
    --http-method DELETE \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ DELETE /my-buys/applets/{appletId} configured"
echo ""

# Create /my-buys/applets/{appletId}/test resource
echo "Setting up /my-buys/applets/{appletId}/test resource..."
APPLET_TEST_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/my-buys/applets/{appletId}/test'].id" \
    --output text)

if [ -z "$APPLET_TEST_ID" ] || [ "$APPLET_TEST_ID" == "None" ]; then
    APPLET_TEST_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $APPLET_ID_RESOURCE \
        --path-part test \
        --region $REGION \
        --query 'id' \
        --output text)
fi

echo "✓ /my-buys/applets/{appletId}/test resource: $APPLET_TEST_ID"
echo ""

# Create POST /my-buys/applets/{appletId}/test
echo "Setting up POST /my-buys/applets/{appletId}/test..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $APPLET_TEST_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $APPLET_TEST_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ POST /my-buys/applets/{appletId}/test configured"
echo ""

# Create /my-buys/applets/{appletId}/regenerate-url resource
echo "Setting up /my-buys/applets/{appletId}/regenerate-url resource..."
REGENERATE_URL_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query "items[?path=='/my-buys/applets/{appletId}/regenerate-url'].id" \
    --output text)

if [ -z "$REGENERATE_URL_ID" ] || [ "$REGENERATE_URL_ID" == "None" ]; then
    REGENERATE_URL_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $APPLET_ID_RESOURCE \
        --path-part regenerate-url \
        --region $REGION \
        --query 'id' \
        --output text)
fi

echo "✓ /my-buys/applets/{appletId}/regenerate-url resource: $REGENERATE_URL_ID"
echo ""

# Create POST /my-buys/applets/{appletId}/regenerate-url
echo "Setting up POST /my-buys/applets/{appletId}/regenerate-url..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $REGENERATE_URL_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $REGENERATE_URL_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ POST /my-buys/applets/{appletId}/regenerate-url configured"
echo ""

# Add Lambda permission for API Gateway to invoke
echo "Adding Lambda permission for API Gateway..."
aws_cmd lambda add-permission \
    --function-name $LAMBDA_FUNCTION_NAME \
    --statement-id apigateway-invoke-my-buys \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    --region $REGION > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Lambda permission added"
else
    echo "⚠ Warning: Lambda permission may already exist (this is OK)"
fi
echo ""

# Deploy API
echo "Deploying API Gateway..."
aws_cmd apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v1 \
    --region $REGION \
    --description "Deploy My Buys endpoints"

if [ $? -eq 0 ]; then
    echo "✓ API Gateway deployed successfully"
else
    echo "⚠ Warning: Deployment may have failed or already exists"
fi
echo ""

echo "✅ API Gateway setup complete!"
echo ""
echo "Base URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/my-buys"
echo ""
echo "Endpoints configured (resources at /my-buys, accessed via /v1/my-buys):"
echo "  POST   /v1/my-buys/applets"
echo "  GET    /v1/my-buys/applets"
echo "  PUT    /v1/my-buys/applets/{appletId}"
echo "  DELETE /v1/my-buys/applets/{appletId}"
echo "  POST   /v1/my-buys/applets/test"
echo "  POST   /v1/my-buys/applets/{appletId}/test"
echo "  POST   /v1/my-buys/applets/{appletId}/regenerate-url"
echo ""
echo "Next steps:"
echo "1. Ensure Lambda function '$LAMBDA_FUNCTION_NAME' exists and is deployed"
echo "2. Test endpoints using the base URL above"

