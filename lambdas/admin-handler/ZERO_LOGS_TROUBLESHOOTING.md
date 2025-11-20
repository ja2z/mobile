# Zero CloudWatch Logs Troubleshooting Guide

## Problem
- `/admin/users` works perfectly and shows CloudWatch logs
- `/admin/whitelist` and `/admin/activity` return 500 errors with **ZERO CloudWatch logs** (not even `START RequestId:`)

## Root Cause Analysis

If you see **ZERO logs** (not even `START RequestId:`), the Lambda is **NOT being invoked at all**. This means the problem is in **API Gateway configuration**, not the Lambda code.

### Why Zero Logs Means Lambda Isn't Invoked

When API Gateway invokes a Lambda:
1. Lambda runtime logs `START RequestId: ...` **immediately** when invoked
2. This happens **before** any of your code runs
3. If you don't see this, API Gateway never called the Lambda

## Most Likely Causes

### 1. Method Responses Configured Incorrectly (MOST COMMON)

**Problem:** For `AWS_PROXY` integrations, method responses should **NOT** be configured. If they are, API Gateway may return errors without invoking Lambda.

**Check:**
```bash
API_ID="qx7x0uioo1"
REGION="us-west-2"

# Check for method responses on whitelist route
RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/whitelist'].id" --output text)
aws apigateway get-method-responses --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION
```

**Fix:** Delete method responses for AWS_PROXY integrations:
```bash
# Delete method response for 200 (if exists)
aws apigateway delete-method-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --status-code 200 \
  --region $REGION

# Delete method response for 500 (if exists)
aws apigateway delete-method-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --status-code 500 \
  --region $REGION
```

**Then redeploy:**
```bash
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name v1 \
  --region $REGION
```

### 2. Integration Responses Configured (Should Be Empty for AWS_PROXY)

**Check:**
```bash
aws apigateway get-integration-responses \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --region $REGION
```

**Fix:** Delete integration responses:
```bash
aws apigateway delete-integration-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --status-code 200 \
  --region $REGION
```

### 3. API Gateway Stage Not Deployed

**Check:**
```bash
# List all stages
aws apigateway get-stages --rest-api-id $API_ID --region $REGION

# Check specific stage
aws apigateway get-stage --rest-api-id $API_ID --stage-name v1 --region $REGION
```

**Fix:** Create a new deployment:
```bash
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name v1 \
  --region $REGION \
  --description "Fix zero logs issue"
```

### 4. Integration Type Mismatch

**Check:**
```bash
INTEGRATION_TYPE=$(aws apigateway get-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --region $REGION \
  --query 'type' \
  --output text)

echo "Integration type: $INTEGRATION_TYPE"
```

**Should be:** `AWS_PROXY`

**If different:** The integration needs to be reconfigured. Compare with the working `/admin/users` route.

### 5. Lambda Permissions Issue

**Check:**
```bash
# Check if API Gateway has permission to invoke Lambda
aws lambda get-policy \
  --function-name admin-handler \
  --region $REGION \
  --query 'Policy' \
  --output text | jq '.'
```

**Fix:** Add permission if missing:
```bash
aws lambda add-permission \
  --function-name admin-handler \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:*:$API_ID/*/*" \
  --region $REGION
```

### 6. Different Lambda Function (Less Likely, But Verify)

**Check:**
```bash
# Compare Lambda functions for all three routes
for path in "/admin/users" "/admin/whitelist" "/admin/activity"; do
  RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='$path'].id" --output text)
  INTEGRATION_URI=$(aws apigateway get-integration --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION --query 'uri' --output text)
  LAMBDA_NAME=$(echo $INTEGRATION_URI | sed -n 's/.*function:\([^:]*\).*/\1/p')
  echo "$path -> $LAMBDA_NAME"
done
```

**All should point to:** `admin-handler`

## Diagnostic Steps

### Step 1: Run Comprehensive Diagnostic Script

```bash
cd lambdas/admin-handler
./diagnose-zero-logs.sh
```

This will check all the above issues automatically.

### Step 2: Test Health Check Endpoint (No Auth Required)

The Lambda now has a health check endpoint that bypasses authentication:

```bash
curl https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/health
```

**Expected:** Should return 200 with deployment marker and prove Lambda is being invoked.

**If this also shows zero logs:** The Lambda is definitely not being invoked, confirming API Gateway configuration issue.

### Step 3: Test Direct Lambda Invocation

Bypass API Gateway entirely to verify Lambda works:

```bash
aws lambda invoke \
  --function-name admin-handler \
  --region us-west-2 \
  --payload '{"path":"/admin/whitelist","httpMethod":"GET","headers":{"Authorization":"Bearer test"}}' \
  /tmp/lambda-response.json

# Check CloudWatch logs
aws logs tail /aws/lambda/admin-handler --follow --region us-west-2
```

**If this shows logs:** Lambda works fine, problem is definitely in API Gateway.

**If this also shows zero logs:** Problem is in Lambda configuration (less likely).

### Step 4: Compare Working vs Non-Working Routes

```bash
# Export configuration for working route
RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/users'].id" --output text)
aws apigateway get-method --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION > /tmp/users-method.json
aws apigateway get-integration --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION > /tmp/users-integration.json

# Export configuration for non-working route
RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/admin/whitelist'].id" --output text)
aws apigateway get-method --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION > /tmp/whitelist-method.json
aws apigateway get-integration --rest-api-id $API_ID --resource-id $RESOURCE_ID --http-method GET --region $REGION > /tmp/whitelist-integration.json

# Compare
diff /tmp/users-method.json /tmp/whitelist-method.json
diff /tmp/users-integration.json /tmp/whitelist-integration.json
```

**Look for differences in:**
- Method responses
- Integration responses
- Integration type
- Integration URI
- Request/response templates

## Quick Fix Checklist

1. ✅ Run `./diagnose-zero-logs.sh` to identify issues
2. ✅ Remove method responses (if configured) for AWS_PROXY integrations
3. ✅ Remove integration responses (if configured) for AWS_PROXY integrations
4. ✅ Verify integration type is `AWS_PROXY` for all routes
5. ✅ Verify all routes point to same Lambda function
6. ✅ Redeploy API Gateway stage
7. ✅ Test health check endpoint (should work without auth)
8. ✅ Test direct Lambda invocation (bypasses API Gateway)
9. ✅ Compare working vs non-working route configurations

## Expected Behavior After Fix

Once fixed, you should see in CloudWatch:
1. `START RequestId: ...` (Lambda runtime log)
2. `========== MODULE INITIALIZATION START ==========`
3. `========== EXPORTED HANDLER CALLED ==========`
4. `========== ADMIN LAMBDA INVOCATION START ==========`
5. All your custom logs

## If Still Not Working

If after all these steps you still see zero logs:

1. **Check API Gateway execution logs** (if enabled):
   ```bash
   aws logs tail /aws/apigateway/$API_ID --follow --region $REGION
   ```

2. **Check if there are multiple API Gateway APIs** with similar names

3. **Verify the exact URL being called** matches the API Gateway endpoint

4. **Check CloudWatch Metrics** for the Lambda:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Invocations \
     --dimensions Name=FunctionName,Value=admin-handler \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Sum \
     --region $REGION
   ```

   If Invocations count is 0 for whitelist/activity calls, Lambda is definitely not being invoked.

## Key Insight

**Zero logs = Lambda not invoked = API Gateway configuration issue**

The Lambda code is fine (Users endpoint proves this). The problem is that API Gateway is not invoking the Lambda for whitelist/activity routes, likely due to:
- Method responses configured incorrectly
- Integration responses configured incorrectly  
- Stage not deployed
- Integration misconfigured

