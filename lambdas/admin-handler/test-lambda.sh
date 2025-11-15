#!/bin/bash

# Test script to verify Lambda is running and check logs

echo "=========================================="
echo "Testing Admin Lambda Deployment"
echo "=========================================="
echo ""

# Test 1: Health check endpoint (no auth required - but might fail without auth)
echo "Test 1: Health Check Endpoint"
echo "URL: https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/health"
echo ""
curl -X GET "https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/health" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  2>&1 | grep -E "(status|message|HTTP Status|error)" || echo "Request completed"
echo ""

# Test 2: Check Lambda function last modified time
echo "Test 2: Lambda Function Last Modified"
echo "Checking when Lambda was last updated..."
aws lambda get-function-configuration \
  --function-name mobile-admin-handler \
  --region us-west-2 \
  --query '[LastModified,CodeSize,Handler,Timeout,MemorySize]' \
  --output table 2>&1 | head -10 || echo "Could not check Lambda configuration"
echo ""

# Test 3: Check recent CloudWatch logs
echo "Test 3: Recent CloudWatch Logs"
echo "Checking last 20 log entries..."
aws logs tail /aws/lambda/mobile-admin-handler \
  --since 10m \
  --region us-west-2 \
  --format short 2>&1 | head -30 || echo "Could not retrieve logs (may need to wait a few minutes after deployment)"
echo ""

echo "=========================================="
echo "If you see logs above, Lambda is running"
echo "If you see 'Could not retrieve logs', wait 2-3 minutes and try again"
echo "=========================================="

