#!/bin/bash

# Diagnostic script to check API Gateway authorization settings
# This helps diagnose the "Invalid key=value pair" error

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

# Configuration
API_ID="qx7x0uioo1"
REGION="us-west-2"

echo "=========================================="
echo "API Gateway Authorization Diagnostic"
echo "=========================================="
echo "API ID: $API_ID"
echo "Region: $REGION"
echo ""

# Check if authenticated
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    exit 1
fi

echo "✓ AWS CLI authenticated"
echo ""

# Get resource IDs
echo "Finding resource IDs..."
APPLETS_RESOURCE=$(aws_cmd apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/v1/my-buys/applets`].id' \
    --output text)

if [ -z "$APPLETS_RESOURCE" ] || [ "$APPLETS_RESOURCE" == "None" ]; then
    echo "✗ ERROR: Could not find /v1/my-buys/applets resource"
    exit 1
fi

echo "✓ Found /v1/my-buys/applets resource: $APPLETS_RESOURCE"
echo ""

# Check GET method authorization
echo "Checking GET /v1/my-buys/applets authorization..."
GET_AUTH=$(aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $APPLETS_RESOURCE \
    --http-method GET \
    --region $REGION \
    --query 'authorizationType' \
    --output text 2>&1)

if [ $? -eq 0 ]; then
    echo "  Authorization Type: $GET_AUTH"
    if [ "$GET_AUTH" != "NONE" ]; then
        echo "  ⚠ WARNING: Authorization type is '$GET_AUTH', should be 'NONE'"
        echo ""
        echo "  Fixing authorization type..."
        aws_cmd apigateway put-method \
            --rest-api-id $API_ID \
            --resource-id $APPLETS_RESOURCE \
            --http-method GET \
            --authorization-type NONE \
            --region $REGION > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "  ✓ Fixed GET method authorization"
        else
            echo "  ✗ Failed to fix GET method authorization"
        fi
    else
        echo "  ✓ GET method authorization is correct (NONE)"
    fi
else
    echo "  ✗ ERROR: Could not check GET method authorization"
    echo "  Error: $GET_AUTH"
fi
echo ""

# Check POST method authorization
echo "Checking POST /v1/my-buys/applets authorization..."
POST_AUTH=$(aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $APPLETS_RESOURCE \
    --http-method POST \
    --region $REGION \
    --query 'authorizationType' \
    --output text 2>&1)

if [ $? -eq 0 ]; then
    echo "  Authorization Type: $POST_AUTH"
    if [ "$POST_AUTH" != "NONE" ]; then
        echo "  ⚠ WARNING: Authorization type is '$POST_AUTH', should be 'NONE'"
        echo ""
        echo "  Fixing authorization type..."
        aws_cmd apigateway put-method \
            --rest-api-id $API_ID \
            --resource-id $APPLETS_RESOURCE \
            --http-method POST \
            --authorization-type NONE \
            --region $REGION > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "  ✓ Fixed POST method authorization"
        else
            echo "  ✗ Failed to fix POST method authorization"
        fi
    else
        echo "  ✓ POST method authorization is correct (NONE)"
    fi
else
    echo "  ✗ ERROR: Could not check POST method authorization"
    echo "  Error: $POST_AUTH"
fi
echo ""

# Check stage-level authorization (this is important!)
echo "Checking stage-level authorization..."
STAGE_AUTH=$(aws_cmd apigateway get-stage \
    --rest-api-id $API_ID \
    --stage-name v1 \
    --region $REGION \
    --query 'methodSettings.*.authorizationType' \
    --output text 2>&1)

if [ $? -eq 0 ] && [ ! -z "$STAGE_AUTH" ] && [ "$STAGE_AUTH" != "None" ]; then
    echo "  ⚠ WARNING: Stage-level authorization settings found: $STAGE_AUTH"
    echo "  This may override method-level settings!"
    echo ""
    echo "  To fix, you may need to clear stage-level authorization settings:"
    echo "  aws apigateway update-stage \\"
    echo "    --rest-api-id $API_ID \\"
    echo "    --stage-name v1 \\"
    echo "    --patch-operations op=remove,path=/methodSettings/*/*/authorizationType \\"
    echo "    --region $REGION"
else
    echo "  ✓ No stage-level authorization override found"
fi
echo ""

# Check API-level authorization (less common but possible)
echo "Checking API-level authorization..."
API_AUTH=$(aws_cmd apigateway get-rest-api \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'policy' \
    --output text 2>&1)

if [ $? -eq 0 ] && [ ! -z "$API_AUTH" ] && [ "$API_AUTH" != "None" ]; then
    echo "  ⚠ WARNING: API-level resource policy found"
    echo "  This may affect authorization behavior"
else
    echo "  ✓ No API-level resource policy found"
fi
echo ""

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "If authorization types were fixed, you need to redeploy:"
echo ""
echo "  aws apigateway create-deployment \\"
echo "    --rest-api-id $API_ID \\"
echo "    --stage-name v1 \\"
echo "    --region $REGION \\"
echo "    --description 'Fix authorization settings'"
echo ""
echo "After redeploying, wait 10-15 seconds for changes to propagate."
echo ""

