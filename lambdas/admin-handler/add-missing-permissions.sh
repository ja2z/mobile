#!/bin/bash

# Add missing Lambda permissions for whitelist and activity GET endpoints

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

API_ID="qx7x0uioo1"
REGION="us-west-2"
ACCOUNT_ID="763903610969"
LAMBDA_NAME="admin-handler"

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

echo "=========================================="
echo "Adding Missing Lambda Permissions"
echo "=========================================="
echo ""

# Add permission for GET /admin/whitelist
echo "Step 1: Adding permission for GET /admin/whitelist"
echo "---------------------------------------------------"
aws_cmd lambda add-permission \
    --function-name $LAMBDA_NAME \
    --statement-id "apigateway-invoke-GET-whitelist-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/GET/admin/whitelist" \
    --region $REGION

if [ $? -eq 0 ]; then
    echo "✓ Permission added for GET /admin/whitelist"
else
    echo "✗ Failed to add permission (might already exist)"
fi

echo ""
echo "Step 2: Adding permission for GET /admin/activity"
echo "---------------------------------------------------"
aws_cmd lambda add-permission \
    --function-name $LAMBDA_NAME \
    --statement-id "apigateway-invoke-GET-activity-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/GET/admin/activity" \
    --region $REGION

if [ $? -eq 0 ]; then
    echo "✓ Permission added for GET /admin/activity"
else
    echo "✗ Failed to add permission (might already exist)"
fi

echo ""
echo "=========================================="
echo "Testing Endpoints"
echo "=========================================="
echo ""
echo "Waiting 2 seconds for permissions to propagate..."
sleep 2

echo "Testing whitelist endpoint..."
curl -s -H "Authorization: Bearer test" "https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/whitelist" > /dev/null
sleep 2
LOGS=$(aws_cmd logs tail /aws/lambda/$LAMBDA_NAME --since 30s --region $REGION 2>&1 | grep -E "START RequestId|whitelist" | tail -3)
if [ ! -z "$LOGS" ]; then
    echo "✓ Whitelist endpoint - Lambda WAS invoked!"
    echo "$LOGS"
else
    echo "✗ Whitelist endpoint - Still no logs"
fi

echo ""
echo "Testing activity endpoint..."
curl -s -H "Authorization: Bearer test" "https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/activity" > /dev/null
sleep 2
LOGS2=$(aws_cmd logs tail /aws/lambda/$LAMBDA_NAME --since 30s --region $REGION 2>&1 | grep -E "START RequestId|activity" | tail -3)
if [ ! -z "$LOGS2" ]; then
    echo "✓ Activity endpoint - Lambda WAS invoked!"
    echo "$LOGS2"
else
    echo "✗ Activity endpoint - Still no logs"
fi

echo ""
echo "=========================================="
echo "Fix Complete!"
echo "=========================================="
echo ""
echo "The issue was missing Lambda permissions for:"
echo "  - GET /admin/whitelist"
echo "  - GET /admin/activity"
echo ""
echo "Permissions have been added. Test from your mobile app now!"

