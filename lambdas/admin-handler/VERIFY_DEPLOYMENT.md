# How to Verify Lambda Deployment is Working

## Step 1: Rebuild and Deploy

```bash
cd lambdas/admin-handler
./build-lambda.sh
aws lambda update-function-code --function-name mobile-admin-handler --zip-file fileb://admin-handler.zip --region us-west-2
```

Wait 30 seconds for deployment to complete.

## Step 2: Verify Deployment Marker

The new code includes a deployment marker: `2025-11-14T05:20:00.000Z-DEBUG-VERSION`

### Option A: Test via Mobile App (if you have admin access)

1. Open the mobile app
2. Go to Admin section
3. Click "Health Check" (if available) or try Users endpoint
4. Check the response - it should include `deploymentMarker: "2025-11-14T05:20:00.000Z-DEBUG-VERSION"`

### Option B: Test via curl with Auth Token

```bash
# Get your JWT token from the mobile app (check React Native debugger or logs)
TOKEN="your-jwt-token-here"

# Test health endpoint
curl -X GET "https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/health" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Should return: {"status":"ok","message":"Admin Lambda is working","deploymentMarker":"2025-11-14T05:20:00.000Z-DEBUG-VERSION",...}
```

## Step 3: Check CloudWatch Logs

### Via AWS Console:
1. Go to CloudWatch → Log Groups
2. Find `/aws/lambda/mobile-admin-handler`
3. Click on the most recent log stream
4. Look for: `DEPLOYMENT MARKER: 2025-11-14T05:20:00.000Z-DEBUG-VERSION`

### Via AWS CLI (if SSL issues resolved):
```bash
aws logs tail /aws/lambda/mobile-admin-handler --since 5m --region us-west-2 --format short | grep "DEPLOYMENT MARKER"
```

## Step 4: Test Whitelist Endpoint

After verifying the deployment marker appears in logs:

1. Try the whitelist endpoint from mobile app
2. Immediately check CloudWatch logs
3. You should see:
   - `========== ADMIN LAMBDA INVOCATION START ==========`
   - `DEPLOYMENT MARKER: 2025-11-14T05:20:00.000Z-DEBUG-VERSION`
   - `========== STARTING ROUTING LOGIC ==========`
   - `========== MATCHED WHITELIST ROUTE ==========`
   - `========== handleListWhitelist FUNCTION ENTERED ==========`

## If You Still See NO Logs:

### Check API Gateway Configuration:
1. Verify API Gateway route `/v1/admin/whitelist` points to `mobile-admin-handler` Lambda
2. Verify API Gateway route `/v1/admin/activity` points to `mobile-admin-handler` Lambda
3. Check if there are multiple API Gateway stages (dev/prod) - make sure you're testing the right one

### Check Lambda Configuration:
1. Verify handler is set to: `index.handler`
2. Verify timeout is at least 30 seconds
3. Verify memory is at least 256 MB

### Check Lambda Permissions:
1. Verify API Gateway has permission to invoke the Lambda
2. Verify Lambda has CloudWatch Logs permissions

## Quick Test: Add More Obvious Logging

If logs still don't appear, the Lambda might not be invoked at all. Check API Gateway logs or add a test endpoint that doesn't require auth.

