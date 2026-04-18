#!/bin/bash

# Add PUT /v1/my-buys/applets/{appletId}/color route to API Gateway.
# Used by the My Apps edit screen's live color picker to persist the
# per-user accent color without requiring the user to press Save.
# Idempotent - safe to re-run; existing resources / methods / permissions
# are skipped. Run once after shipping the my-buys-handler Lambda update
# that adds handleUpdateAppletColor.

set -e  # Exit on any error

# Set AWS profile and disable SSL verification (matches other my-buys scripts).
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper - filters noisy InsecureRequestWarning output.
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

# Configuration (must match the other my-buys-handler scripts).
API_ID="qx7x0uioo1"
REGION="us-west-2"
LAMBDA_FUNCTION_NAME="my-buys-handler"
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_FUNCTION_NAME}"

echo "API Gateway ID: $API_ID"
echo "Region:         $REGION"
echo "Lambda:         $LAMBDA_FUNCTION_NAME"
echo "Lambda ARN:     $LAMBDA_ARN"
echo ""

# ----- helpers ---------------------------------------------------------------

get_resource_id() {
    local target_path="$1"
    local id
    id=$(aws_cmd apigateway get-resources \
        --rest-api-id "$API_ID" \
        --region "$REGION" \
        --limit 500 \
        --query "items[?path==\`${target_path}\`].id" \
        --output text)
    if [ "$id" == "None" ]; then
        id=""
    fi
    echo "$id"
}

ensure_child_resource() {
    local parent_id="$1"
    local parent_path="$2"
    local path_part="$3"
    local full_path="$4"

    local child_id
    child_id=$(get_resource_id "$full_path")
    if [ -n "$child_id" ]; then
        echo "✓ ${full_path} exists: ${child_id}" >&2
        echo "$child_id"
        return
    fi

    echo "📝 Creating ${full_path} under ${parent_path}..." >&2
    child_id=$(aws_cmd apigateway create-resource \
        --rest-api-id "$API_ID" \
        --parent-id "$parent_id" \
        --path-part "$path_part" \
        --region "$REGION" \
        --query 'id' \
        --output text)
    echo "✓ Created ${full_path}: ${child_id}" >&2
    echo "$child_id"
}

# ----- resource chain --------------------------------------------------------

# /my-buys/applets/{appletId} should already exist from the main setup script.
APPLET_ID_RES=$(get_resource_id "/my-buys/applets/{appletId}")
if [ -z "$APPLET_ID_RES" ]; then
    echo "✗ ERROR: /my-buys/applets/{appletId} resource not found on API ${API_ID}."
    echo "   Run lambdas/my-buys-handler/setup-api-gateway.sh first."
    exit 1
fi
echo "✓ /my-buys/applets/{appletId} exists: ${APPLET_ID_RES}"

# /my-buys/applets/{appletId}/color
COLOR_ID=$(ensure_child_resource "$APPLET_ID_RES" '/my-buys/applets/{appletId}' "color" '/my-buys/applets/{appletId}/color')
echo ""

# ----- PUT method ------------------------------------------------------------

PUT_EXISTS=$(aws_cmd apigateway get-method \
    --rest-api-id "$API_ID" \
    --resource-id "$COLOR_ID" \
    --http-method PUT \
    --region "$REGION" \
    --query 'httpMethod' \
    --output text 2>/dev/null || echo "None")

if [ "$PUT_EXISTS" == "None" ]; then
    echo "📝 Creating PUT method on /my-buys/applets/{appletId}/color..."
    aws_cmd apigateway put-method \
        --rest-api-id "$API_ID" \
        --resource-id "$COLOR_ID" \
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
    --resource-id "$COLOR_ID" \
    --http-method PUT \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region "$REGION" > /dev/null
echo "✓ Lambda integration configured"
echo ""

# ----- Lambda invoke permission ---------------------------------------------

STATEMENT_ID="apigateway-${API_ID}-my-buys-applet-color"
SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/PUT/my-buys/applets/*/color"

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
    --description "Add PUT /my-buys/applets/{appletId}/color" \
    --query 'id' \
    --output text)
echo "✓ Deployment: ${DEPLOYMENT_ID}"
echo ""

echo "✅ Route setup complete."
echo ""
echo "📋 Summary"
echo "   Route:        PUT /v1/my-buys/applets/{appletId}/color"
echo "   Resource ID:  ${COLOR_ID}"
echo "   Lambda:       ${LAMBDA_FUNCTION_NAME}"
echo "   Deployment:   ${DEPLOYMENT_ID}"
echo ""
echo "🧪 Smoke-test from a shell with a user JWT:"
echo "   curl -X PUT \\"
echo "     -H 'Authorization: Bearer <jwt>' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"color\":\"#A855F7\"}' \\"
echo "     https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/my-buys/applets/<appletId>/color"
