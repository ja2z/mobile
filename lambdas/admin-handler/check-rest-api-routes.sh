#!/bin/bash

# Check REST API routes and their Lambda integrations
API_ID="qx7x0uioo1"
REGION="us-west-2"

echo "=========================================="
echo "REST API Route & Lambda Verification"
echo "=========================================="
echo ""

check_rest_api_method() {
    local path=$1
    local method=$2
    
    echo "Checking: $method $path"
    
    # Get resource ID
    RESOURCE_ID=$(aws apigateway get-resources \
        --rest-api-id $API_ID \
        --region $REGION \
        --query "items[?path=='$path'].id" \
        --output text 2>/dev/null)
    
    if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" == "None" ]; then
        echo "  ✗ Resource not found"
        return 1
    fi
    
    echo "  Resource ID: $RESOURCE_ID"
    
    # Check if method exists
    METHOD_EXISTS=$(aws apigateway get-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'httpMethod' \
        --output text 2>/dev/null)
    
    if [ -z "$METHOD_EXISTS" ] || [ "$METHOD_EXISTS" == "None" ]; then
        echo "  ✗ Method $method not configured"
        return 1
    fi
    
    echo "  ✓ Method $method exists"
    
    # Get integration
    INTEGRATION_URI=$(aws apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'uri' \
        --output text 2>/dev/null)
    
    if [ -z "$INTEGRATION_URI" ] || [ "$INTEGRATION_URI" == "None" ]; then
        echo "  ✗ No Lambda integration configured"
        return 1
    fi
    
    # Extract Lambda function name
    LAMBDA_NAME=$(echo $INTEGRATION_URI | sed -n 's/.*function:\([^:]*\).*/\1/p' || echo "unknown")
    echo "  ✓ Lambda: $LAMBDA_NAME"
    
    # Check integration type
    INTEGRATION_TYPE=$(aws apigateway get-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $method \
        --region $REGION \
        --query 'type' \
        --output text 2>/dev/null)
    
    echo "  Integration Type: $INTEGRATION_TYPE"
    
    return 0
}

echo "=== Users Route ==="
check_rest_api_method "/admin/users" "GET"
USERS_GET=$?
echo ""

echo "=== Whitelist Route ==="
check_rest_api_method "/admin/whitelist" "GET"
WHITELIST_GET=$?
echo ""

echo "=== Activity Route ==="
check_rest_api_method "/admin/activity" "GET"
ACTIVITY_GET=$?
echo ""

echo "=========================================="
echo "Summary:"
echo "=========================================="

if [ $USERS_GET -eq 0 ] && [ $WHITELIST_GET -eq 0 ] && [ $ACTIVITY_GET -eq 0 ]; then
    echo "✓ All routes configured: YES"
    
    # Get Lambda names to compare
    echo ""
    echo "Lambda Functions:"
    
    RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/users'].id" --output text)
    LAMBDA1=$(aws apigateway get-integration --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION --query 'uri' --output text | sed -n 's/.*function:\([^:]*\).*/\1/p')
    
    RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/whitelist'].id" --output text)
    LAMBDA2=$(aws apigateway get-integration --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION --query 'uri' --output text | sed -n 's/.*function:\([^:]*\).*/\1/p')
    
    RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/activity'].id" --output text)
    LAMBDA3=$(aws apigateway get-integration --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION --query 'uri' --output text | sed -n 's/.*function:\([^:]*\).*/\1/p')
    
    echo "  Users:    $LAMBDA1"
    echo "  Whitelist: $LAMBDA2"
    echo "  Activity:  $LAMBDA3"
    
    if [ "$LAMBDA1" == "$LAMBDA2" ] && [ "$LAMBDA2" == "$LAMBDA3" ]; then
        echo ""
        echo "✓ All routes point to the SAME Lambda: YES"
    else
        echo ""
        echo "✗ Routes point to DIFFERENT Lambdas:"
        echo "  This is likely the problem!"
    fi
else
    echo "✗ Some routes not configured:"
    [ $USERS_GET -ne 0 ] && echo "  - GET /admin/users"
    [ $WHITELIST_GET -ne 0 ] && echo "  - GET /admin/whitelist"
    [ $ACTIVITY_GET -ne 0 ] && echo "  - GET /admin/activity"
fi

echo ""
echo "=========================================="

