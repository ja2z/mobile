#!/bin/bash

# Add PUT /v1/admin/applets/built-in/{appletId}/color route to API Gateway.
# Used by the admin "Apps" tab to update the global accent color of a
# built-in applet. Idempotent - safe to re-run; existing resources / methods
# / permissions are skipped. Run once after shipping the admin-handler Lambda
# update that adds handleUpdateBuiltInAppletColor.

set -e  # Exit on any error

# Set AWS profile and disable SSL verification (matches other admin scripts).
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

# Configuration (must match the other admin-handler scripts).
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

# ----- helpers ---------------------------------------------------------------

# get_resource_id <path>
# Echoes the API Gateway resource id for <path>, or empty string if none.
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

# ensure_child_resource <parent_id> <parent_path> <path_part> <full_path>
# Creates the child resource if it does not exist. Echoes the resource id.
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

# /admin should already exist - look it up.
ADMIN_ID=$(get_resource_id "/admin")
if [ -z "$ADMIN_ID" ]; then
    echo "✗ ERROR: /admin resource not found on API ${API_ID}."
    echo "   Other admin routes must be set up first."
    exit 1
fi
echo "✓ /admin exists: ${ADMIN_ID}"

# /admin/applets
ADMIN_APPLETS_ID=$(ensure_child_resource "$ADMIN_ID" "/admin" "applets" "/admin/applets")
# /admin/applets/built-in
ADMIN_BUILTIN_ID=$(ensure_child_resource "$ADMIN_APPLETS_ID" "/admin/applets" "built-in" "/admin/applets/built-in")
# /admin/applets/built-in/{appletId}
APPLET_ID_RES=$(ensure_child_resource "$ADMIN_BUILTIN_ID" "/admin/applets/built-in" '{appletId}' '/admin/applets/built-in/{appletId}')
# /admin/applets/built-in/{appletId}/color
COLOR_ID=$(ensure_child_resource "$APPLET_ID_RES" '/admin/applets/built-in/{appletId}' "color" '/admin/applets/built-in/{appletId}/color')
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
    echo "📝 Creating PUT method on /admin/applets/built-in/{appletId}/color..."
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

STATEMENT_ID="apigateway-${API_ID}-built-in-applet-color"
SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/PUT/admin/applets/built-in/*/color"

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
    --description "Add PUT /admin/applets/built-in/{appletId}/color" \
    --query 'id' \
    --output text)
echo "✓ Deployment: ${DEPLOYMENT_ID}"
echo ""

echo "✅ Route setup complete."
echo ""
echo "📋 Summary"
echo "   Route:        PUT /v1/admin/applets/built-in/{appletId}/color"
echo "   Resource ID:  ${COLOR_ID}"
echo "   Lambda:       ${LAMBDA_FUNCTION_NAME}"
echo "   Deployment:   ${DEPLOYMENT_ID}"
echo ""
echo "🧪 Smoke-test from a shell with an admin JWT:"
echo "   curl -X PUT \\"
echo "     -H 'Authorization: Bearer <admin-jwt>' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"color\":\"#A855F7\"}' \\"
echo "     https://${API_ID}.execute-api.${REGION}.amazonaws.com/v1/admin/applets/built-in/<appletId>/color"
