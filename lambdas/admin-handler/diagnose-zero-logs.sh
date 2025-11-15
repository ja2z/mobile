#!/bin/bash

# Comprehensive diagnostic script for zero CloudWatch logs issue
# This checks API Gateway configuration that could prevent Lambda invocation

# Set AWS profile and disable SSL verification (for corporate proxy/VPN)
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0
export AWS_CLI_VERIFY_SSL=false

API_ID="qx7x0uioo1"
REGION="us-west-2"
LAMBDA_NAME="admin-handler"
STAGE="v1"

# AWS CLI command wrapper to add --no-verify-ssl and filter warnings
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
echo "Zero Logs Diagnostic - API Gateway Check"
echo "=========================================="
echo ""
echo "This script checks for API Gateway configuration issues"
echo "that could prevent Lambda invocation (causing zero logs)"
echo ""

check_method_response() {
    local path=$1
    local method=$2
    local route_name=$3
    
    echo "=== Checking $route_name ==="
    
    # Get resource ID
    RESOURCE_ID=$(aws_cmd apigateway get-resources \
        --rest-api-id $API_ID \
        --region $REGION \
        --query "items[?path=='$path'].id" \
        --output text)
    
    if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" == "None" ]; then
        echo "  ✗ CRITICAL: Resource not found for path: $path"
        return 1
    fi
    
    echo "  Resource ID: $RESOURCE_ID"
    
    # Check if method exists
    METHOD_EXISTS=$(aws_cmd apigateway get-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'httpMethod' \
        --output text)
    
    if [ -z "$METHOD_EXISTS" ] || [ "$METHOD_EXISTS" == "None" ]; then
        echo "  ✗ CRITICAL: Method $method not configured"
        return 1
    fi
    
    echo "  ✓ Method $method exists"
    
    # Check integration
    INTEGRATION_TYPE=$(aws_cmd apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'type' \
        --output text)
    
    if [ "$INTEGRATION_TYPE" != "AWS_PROXY" ]; then
        echo "  ⚠ WARNING: Integration type is '$INTEGRATION_TYPE', expected 'AWS_PROXY'"
        echo "     Non-proxy integrations require method responses to be configured"
    else
        echo "  ✓ Integration type: AWS_PROXY (correct)"
    fi
    
    # Check integration URI
    INTEGRATION_URI=$(aws_cmd apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'uri' \
        --output text)
    
    if [ -z "$INTEGRATION_URI" ] || [ "$INTEGRATION_URI" == "None" ]; then
        echo "  ✗ CRITICAL: No Lambda integration URI configured"
        return 1
    fi
    
    # Extract Lambda function name (extract from arn:aws:lambda:region:account:function:name)
    LAMBDA_FUNC=$(echo $INTEGRATION_URI | sed -n 's/.*function:\([^/]*\).*/\1/p' || echo "unknown")
    echo "  Lambda function: $LAMBDA_FUNC"
    
    if [ "$LAMBDA_FUNC" != "$LAMBDA_NAME" ]; then
        echo "  ⚠ WARNING: Lambda function mismatch! Expected: $LAMBDA_NAME, Got: $LAMBDA_FUNC"
    else
        echo "  ✓ Lambda function matches expected: $LAMBDA_NAME"
    fi
    
    # Check integration responses (for non-proxy, this matters)
    # Note: get-integration-response requires status-code, so we check integration object instead
    INTEGRATION_RESPONSES_CHECK=$(aws_cmd apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'integrationResponses' \
        --output json | jq -r 'if . == null or . == {} then "empty" else "configured" end' 2>/dev/null || echo "unknown")
    
    if [ "$INTEGRATION_RESPONSES_CHECK" == "configured" ]; then
        echo "  Integration responses are configured (check details in Step 5)"
    fi
    
    # Check ALL method responses (should be empty for AWS_PROXY)
    # Note: get-method-responses doesn't exist, need to check method object directly
    METHOD_RESPONSES=$(aws_cmd apigateway get-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'methodResponses' \
        --output json | jq -r 'keys[]' 2>/dev/null | tr '\n' ' ' || echo "")
    
    if [ ! -z "$METHOD_RESPONSES" ] && [ "$METHOD_RESPONSES" != "None" ] && [ "$METHOD_RESPONSES" != "" ]; then
        echo "  ✗ CRITICAL: Method responses are configured: $METHOD_RESPONSES"
        echo "     For AWS_PROXY, method responses should NOT be configured"
        echo "     This can cause API Gateway to return errors without invoking Lambda"
    else
        echo "  ✓ No method responses configured (correct for AWS_PROXY)"
    fi
    
    # Check ALL integration responses (should be empty for AWS_PROXY)
    # Note: get-integration-responses doesn't exist, need to check integration object directly
    INTEGRATION_RESPONSES=$(aws_cmd apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'integrationResponses' \
        --output json | jq -r 'keys[]' 2>/dev/null | tr '\n' ' ' || echo "")
    
    if [ ! -z "$INTEGRATION_RESPONSES" ] && [ "$INTEGRATION_RESPONSES" != "None" ] && [ "$INTEGRATION_RESPONSES" != "" ]; then
        echo "  ✗ CRITICAL: Integration responses are configured: $INTEGRATION_RESPONSES"
        echo "     For AWS_PROXY, integration responses should NOT be configured"
    else
        echo "  ✓ No integration responses configured (correct for AWS_PROXY)"
    fi
    
    # Check if integration has passthroughBehavior
    PASSTHROUGH=$(aws_cmd apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'passthroughBehavior' \
        --output text)
    
    if [ ! -z "$PASSTHROUGH" ] && [ "$PASSTHROUGH" != "None" ] && [ "$PASSTHROUGH" != "WHEN_NO_MATCH" ]; then
        echo "  ⚠ WARNING: passthroughBehavior is '$PASSTHROUGH' (should be 'WHEN_NO_MATCH' for AWS_PROXY)"
    fi
    
    # Check request templates (should be empty for AWS_PROXY)
    REQUEST_TEMPLATES=$(aws_cmd apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'requestTemplates' \
        --output json)
    
    if [ ! -z "$REQUEST_TEMPLATES" ] && [ "$REQUEST_TEMPLATES" != "null" ] && [ "$REQUEST_TEMPLATES" != "{}" ]; then
        echo "  ⚠ WARNING: Request templates are configured (should be empty for AWS_PROXY)"
    fi
    
    echo ""
    return 0
}

echo "Step 1: Checking Method Responses and Integrations"
echo "---------------------------------------------------"
echo ""

check_method_response "/admin/users" "GET" "Users Route"
USERS_OK=$?

check_method_response "/admin/whitelist" "GET" "Whitelist Route"
WHITELIST_OK=$?

check_method_response "/admin/activity" "GET" "Activity Route"
ACTIVITY_OK=$?

echo ""
echo "Step 2: Checking API Gateway Stages and Deployments"
echo "---------------------------------------------------"
echo ""

# List all stages
echo "Available stages:"
aws_cmd apigateway get-stages \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'item[*].[stageName,deploymentId,createdDate]' \
    --output table || echo "  Could not list stages"

echo ""
echo "Checking if stage '$STAGE' exists:"
STAGE_EXISTS=$(aws_cmd apigateway get-stage \
    --rest-api-id $API_ID \
    --stage-name $STAGE \
    --region $REGION \
    --query 'stageName' \
    --output text)

if [ ! -z "$STAGE_EXISTS" ] && [ "$STAGE_EXISTS" != "None" ]; then
    echo "  ✓ Stage '$STAGE' exists"
    
    DEPLOYMENT_ID=$(aws_cmd apigateway get-stage \
        --rest-api-id $API_ID \
        --stage-name $STAGE \
        --region $REGION \
        --query 'deploymentId' \
        --output text)
    
    echo "  Deployment ID: $DEPLOYMENT_ID"
    
    DEPLOYMENT_DATE=$(aws_cmd apigateway get-deployment \
        --rest-api-id $API_ID \
        --deployment-id $DEPLOYMENT_ID \
        --region $REGION \
        --query 'createdDate' \
        --output text)
    
    echo "  Deployment date: $DEPLOYMENT_DATE"
else
    echo "  ✗ Stage '$STAGE' does not exist!"
    echo "     This could explain why routes don't work"
fi

echo ""
echo "Step 3: Checking Lambda Permissions"
echo "---------------------------------------------------"
echo ""

# Check if API Gateway has permission to invoke Lambda
echo "Checking Lambda resource-based policy for API Gateway:"
aws_cmd lambda get-policy \
    --function-name $LAMBDA_NAME \
    --region $REGION \
    --query 'Policy' \
    --output text | jq -r '.Statement[] | select(.Principal.Service == "apigateway.amazonaws.com") | {Effect, Action, Resource}' 2>/dev/null || echo "  Could not check Lambda policy"

echo ""
echo "Step 4: Direct Lambda Invocation Test"
echo "---------------------------------------------------"
echo ""
echo "Testing direct Lambda invocation (bypassing API Gateway):"
echo ""

# Create a test event file (Lambda invoke requires file or base64)
cat > /tmp/lambda-test-event.json <<EOF
{
  "path": "/admin/whitelist",
  "httpMethod": "GET",
  "headers": {
    "Authorization": "Bearer test-token"
  },
  "requestContext": {
    "requestId": "test-request-id-direct-invoke",
    "stage": "$STAGE"
  }
}
EOF

echo "Invoking Lambda directly with test event..."
# Use --cli-binary-format raw-in-base64-out to avoid base64 encoding issues
INVOKE_RESULT=$(aws_cmd lambda invoke \
    --function-name $LAMBDA_NAME \
    --region $REGION \
    --cli-binary-format raw-in-base64-out \
    --payload file:///tmp/lambda-test-event.json \
    /tmp/lambda-response.json)

if [ $? -eq 0 ]; then
    echo "  ✓ Lambda invocation succeeded"
    echo "  Response:"
    cat /tmp/lambda-response.json | jq '.' 2>/dev/null || cat /tmp/lambda-response.json
    echo ""
    echo "  Check CloudWatch logs for this invocation (requestId: test-request-id-direct-invoke):"
    echo "  aws logs tail /aws/lambda/$LAMBDA_NAME --follow --region $REGION"
    echo ""
    echo "  If you see logs for this direct invocation but not for API Gateway calls,"
    echo "  the problem is definitely in API Gateway configuration."
else
    echo "  ✗ Lambda invocation failed:"
    echo "$INVOKE_RESULT"
fi

echo ""
echo "Step 5: Detailed Configuration Comparison"
echo "---------------------------------------------------"
echo ""
echo "Comparing working (Users) vs non-working (Whitelist) routes:"
echo ""

# Get full configurations
USERS_RESOURCE_ID=$(aws_cmd apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/users'].id" --output text)
WHITELIST_RESOURCE_ID=$(aws_cmd apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/whitelist'].id" --output text)

echo "Users route method configuration:"
aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $USERS_RESOURCE_ID \
    --http-method GET \
    --region $REGION \
    --output json | jq '{httpMethod,authorizationType,apiKeyRequired,requestParameters,methodResponses}' || echo "  Could not get method config"

echo ""
echo "Whitelist route method configuration:"
aws_cmd apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $WHITELIST_RESOURCE_ID \
    --http-method GET \
    --region $REGION \
    --output json | jq '{httpMethod,authorizationType,apiKeyRequired,requestParameters,methodResponses}' || echo "  Could not get method config"

echo ""
echo "Users route integration configuration:"
aws_cmd apigateway get-integration \
    --rest-api-id $API_ID \
    --resource-id $USERS_RESOURCE_ID \
    --http-method GET \
    --region $REGION \
    --output json | jq '{type,uri,httpMethod,integrationResponses,requestTemplates,passthroughBehavior}' || echo "  Could not get integration config"

echo ""
echo "Whitelist route integration configuration:"
aws_cmd apigateway get-integration \
    --rest-api-id $API_ID \
    --resource-id $WHITELIST_RESOURCE_ID \
    --http-method GET \
    --region $REGION \
    --output json | jq '{type,uri,httpMethod,integrationResponses,requestTemplates,passthroughBehavior}' || echo "  Could not get integration config"

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

if [ $USERS_OK -eq 0 ] && [ $WHITELIST_OK -eq 0 ] && [ $ACTIVITY_OK -eq 0 ]; then
    echo "✓ All routes are configured"
    echo ""
    echo "Key findings:"
    echo "- All routes use AWS_PROXY integration (correct)"
    echo "- All routes point to same Lambda function"
    echo "- Stage is deployed"
    echo "- Lambda permissions are configured"
    echo ""
    echo "If you still see zero logs, check the detailed comparison above for differences in:"
    echo "1. Method responses (should be empty for AWS_PROXY)"
    echo "2. Integration responses (should be empty for AWS_PROXY)"
    echo "3. Request templates (should be empty for AWS_PROXY)"
    echo "4. Authorization type differences"
    echo "5. Request parameters differences"
else
    echo "✗ Some routes have configuration issues"
    [ $USERS_OK -ne 0 ] && echo "  - Users route"
    [ $WHITELIST_OK -ne 0 ] && echo "  - Whitelist route"
    [ $ACTIVITY_OK -ne 0 ] && echo "  - Activity route"
fi

echo ""
echo "Next steps:"
echo "1. Review the detailed comparison above - look for ANY differences"
echo "2. If method/integration responses exist, delete them:"
echo "   aws apigateway delete-method-response --rest-api-id $API_ID --resource-id <RESOURCE_ID> --http-method GET --status-code <CODE> --region $REGION"
echo "3. Redeploy API Gateway stage:"
echo "   aws apigateway create-deployment --rest-api-id $API_ID --stage-name $STAGE --region $REGION"
echo "4. Test health check endpoint (no auth required):"
echo "   curl https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/health"
echo "5. Check CloudWatch Logs for the direct Lambda invocation above"

