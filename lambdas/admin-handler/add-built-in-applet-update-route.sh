#!/bin/bash

# Add PUT /v1/admin/applets/built-in/{appletId} route to API Gateway.
# Used by the admin "Apps" tab to update name / subtitle / color on a
# built-in applet. Idempotent - safe to re-run; existing resources / methods
# / permissions are skipped. Run once after shipping the admin-handler Lambda
# update that adds handleUpdateBuiltInAppletDetails.
#
# This script assumes add-built-in-applet-color-route.sh has already been run
# (the {appletId} resource must already exist as the parent of /color).

set -e  # Exit on any error

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning\|warnings.warn(" >&2)
}

echo "🔐 Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

API_ID="qx7x0uioo1"
REGION="us-west-2"
LAMBDA_FUNCTION_NAME="admin-handler"
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

echo "API Gateway ID: $API_ID"
echo "Region:         $REGION"
echo "Lambda:         $LAMBDA_FUNCTION_NAME"
echo "Lambda ARN:     $LAMBDA_ARN"
echo ""

get_resource_id() {
    local target_path="$1"
    local id
    id=$(aws_cmd apigateway get-resources \
        --rest-api-id "$API_ID" \
        --region "$REGION" \
        --query "items[?path==\`${target_path}\`].id" \
        --output text)
    if [ "$id" == "None" ]; then
        id=""
    fi
    echo "$id"
}

# The {appletId} resource is created by add-built-in-applet-color-route.sh.
APPLET_ID_RES=$(get_resource_id "/admin/applets/built-in/{appletId}")
if [ -z "$APPLET_ID_RES" ]; then
    echo "✗ ERROR: /admin/applets/built-in/{appletId} resource not found."
    echo "   Run add-built-in-applet-color-route.sh first."
    exit 1
fi
echo "✓ /admin/applets/built-in/{appletId} exists: ${APPLET_ID_RES}"
echo ""

# ----- PUT method ------------------------------------------------------------

PUT_EXISTS=$(aws_cmd apigateway get-method \
    --rest-api-id "$API_ID" \
    --resource-id "$APPLET_ID_RES" \
    --http-method PUT \
    --region "$REGION" \
    --query 'httpMethod' \
    --output text 2>/dev/null || echo "None")

if [ "$PUT_EXISTS" == "None" ]; then
    echo "📝 Creating PUT method on /admin/applets/built-in/{appletId}..."
    aws_cmd apigateway put-method \
        --rest-api-id "$API_ID" \
        --resource-id "$APPLET_ID_RES" \
        --http-method PUT \
        --authorization-type NONE \
        --region "$REGION" \
        --no-api-key-required
    echo "✓ PUT method created"
else
    echo "✓ PUT method already exists"
fi
echo ""

# ----- Lambda integration ----------------------------------------------------

echo "📝 Configuring AWS_PROXY integration -> ${LAMBDA_FUNCTION_NAME}..."
aws_cmd apigateway put-integration \
    --rest-api-id "$API_ID" \
    --resource-id "$APPLET_ID_RES" \
    --http-method PUT \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region "$REGION" > /dev/null
echo "✓ Lambda integration configured"
echo ""

# ----- Lambda invoke permission ---------------------------------------------

STATEMENT_ID="apigateway-${API_ID}-built-in-applet-update"
SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/PUT/admin/applets/built-in/*"

echo "📝 Adding Lambda invoke permission (statement-id: ${STATEMENT_ID})..."
if aws_cmd lambda add-permission \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --statement-id "$STATEMENT_ID" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "$SOURCE_ARN" \
    --region "$REGION" > /dev/null 2>&1; then
    echo "✓ Permission added"
else
    echo "✓ Permission already exists (skipped)"
fi
echo ""

# ----- Deploy to v1 stage ----------------------------------------------------

echo "🚀 Deploying API Gateway to stage v1..."
DEPLOYMENT_ID=$(aws_cmd apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name v1 \
    --region "$REGION" \
    --description "Add PUT /admin/applets/built-in/{appletId}" \
    --query 'id' \
    --output text)
echo "✓ Deployment: ${DEPLOYMENT_ID}"
echo ""

echo "✅ Route setup complete."
echo ""
echo "📋 Summary"
echo "   Route:        PUT /v1/admin/applets/built-in/{appletId}"
echo "   Resource ID:  ${APPLET_ID_RES}"
echo "   Lambda:       ${LAMBDA_FUNCTION_NAME}"
echo "   Deployment:   ${DEPLOYMENT_ID}"
echo ""
echo "🧪 Smoke-test from a shell with an admin JWT:"
echo "   curl -X PUT \\"
echo "     -H 'Authorization: Bearer <admin-jwt>' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\":\"New Name\",\"subtitle\":\"New subtitle\"}' \\"
echo "     https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/admin/applets/built-in/<appletId>"
