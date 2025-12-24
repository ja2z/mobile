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
LAMBDA_FUNCTION_NAME="phone-validation-handler"
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

# Check if /phone resource exists
PHONE_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/phone`].id' \
    --output text)

if [ -z "$PHONE_ID" ] || [ "$PHONE_ID" == "None" ]; then
    echo "Creating /phone resource..."
    PHONE_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ROOT_ID \
        --path-part phone \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /phone resource: $PHONE_ID"
else
    echo "✓ /phone resource already exists: $PHONE_ID"
fi
echo ""

# Check if /phone/validate resource exists
VALIDATE_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/phone/validate`].id' \
    --output text)

if [ -z "$VALIDATE_ID" ] || [ "$VALIDATE_ID" == "None" ]; then
    echo "Creating /phone/validate resource..."
    VALIDATE_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $PHONE_ID \
        --path-part validate \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /phone/validate resource: $VALIDATE_ID"
else
    echo "✓ /phone/validate resource already exists: $VALIDATE_ID"
fi
echo ""

# Check if /phone/verify resource exists
VERIFY_ID=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/phone/verify`].id' \
    --output text)

if [ -z "$VERIFY_ID" ] || [ "$VERIFY_ID" == "None" ]; then
    echo "Creating /phone/verify resource..."
    VERIFY_ID=$(aws_cmd apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $PHONE_ID \
        --path-part verify \
        --region $REGION \
        --query 'id' \
        --output text)
    echo "✓ Created /phone/verify resource: $VERIFY_ID"
else
    echo "✓ /phone/verify resource already exists: $VERIFY_ID"
fi
echo ""

# Lambda ARN
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

# Create POST /phone/validate
echo "Setting up POST /phone/validate..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $VALIDATE_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $VALIDATE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ POST /phone/validate configured"
echo ""

# Create POST /phone/verify
echo "Setting up POST /phone/verify..."
aws_cmd apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $VERIFY_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1

aws_cmd apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $VERIFY_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region $REGION > /dev/null 2>&1

echo "✓ POST /phone/verify configured"
echo ""

# Add Lambda permission for API Gateway
echo "Adding Lambda permission for API Gateway..."
aws_cmd lambda add-permission \
    --function-name $LAMBDA_FUNCTION_NAME \
    --statement-id apigateway-invoke-phone-validation \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    --region $REGION > /dev/null 2>&1 || echo "⚠ Warning: Permission may already exist (this is OK)"
echo ""

# Deploy to v1 stage
echo "Deploying API Gateway to v1 stage..."
DEPLOYMENT_ID=$(aws_cmd apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name v1 \
    --region $REGION \
    --description "Add phone validation endpoints /v1/phone/validate and /v1/phone/verify" \
    --query 'id' \
    --output text)

echo "✓ Deployment created: $DEPLOYMENT_ID"
echo ""

echo "=========================================="
echo "✅ API Gateway Setup Complete!"
echo "=========================================="
echo ""
echo "Endpoints:"
echo "  POST https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/phone/validate"
echo "  POST https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/phone/verify"
echo ""
echo "Next steps:"
echo "1. Test the endpoints with sample requests"
echo "2. Verify Lambda logs in CloudWatch"
echo ""

