# Admin Lambda Debugging Summary - For New Chat Session

## Problem Description

**Symptom:** When accessing "whitelist" and "activity log" endpoints in the admin section, getting hard 500 errors with **ZERO CloudWatch logs**. The "Users" endpoint works perfectly and shows logs.

**Error from mobile app:**
```
LOG  [AdminService] Making API call: {"endpoint": "/whitelist", "hasBody": false, "method": "GET", "url": "https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/whitelist"}
LOG  [AdminService] Response received: {"duration": "255ms", "headers": {...}, "ok": false, "status": 500, "statusText": ""}
LOG  [AdminService] Response body (first 500 chars): {"message": "Internal server error"}
ERROR [AdminService] API call failed: {"endpoint": "/whitelist", "errorData": {"message": "Internal server error"}, "status": 500}
ERROR Error loading whitelist: [Error: Internal server error]
```

**Key Observation:** No CloudWatch logs appear at all for whitelist/activity endpoints - not even:
- `START RequestId:` (Lambda invocation start)
- `========== EXPORTED HANDLER CALLED ==========`
- `========== MODULE INITIALIZATION START ==========`
- Any logs whatsoever

**Users endpoint works fine** and shows all expected logs including deployment marker.

## What We've Verified

### API Gateway Configuration
- **API ID:** `qx7x0uioo1`
- **Region:** `us-west-2`
- **API Type:** REST API (not HTTP API)
- All routes (`/admin/users`, `/admin/whitelist`, `/admin/activity`) exist
- All routes point to the **same Lambda function**: `admin-handler`
- All routes use the **same integration type**: `AWS_PROXY`
- All routes have GET methods configured
- Integration URI (identical for all): `arn:aws:apigateway:us-west-2:lambda:path/2015-03-31/functions/arn:aws:lambda:us-west-2:763903610969:function:admin-handler/invocations`

**Verification commands used:**
```bash
# List all routes
aws apigateway get-resources --rest-api-id qx7x0uioo1 --region us-west-2

# Check integration for each route
for path in "/admin/users" "/admin/whitelist" "/admin/activity"; do
  RESOURCE_ID=$(aws apigateway get-resources --rest-api-id qx7x0uioo1 --region us-west-2 --query "items[?path=='$path'].id" --output text)
  aws apigateway get-integration --rest-api-id qx7x0uioo1 --resource-id $RESOURCE_ID --http-method GET --region us-west-2 --query 'uri' --output text
done
```

### Lambda Configuration
- **Function name:** `admin-handler` (matches API Gateway integration)
- **Handler:** `index.handler` (correct)
- **Runtime:** `nodejs20.x`
- **Memory:** Tried 128MB (original), then 512MB - **no difference**
- **Timeout:** 3 seconds (very short, but Users works with same timeout)
- **Last modified:** Confirmed new code is deployed (deployment marker `2025-11-14T05:45:00.000Z-ROUTING-DEBUG` appears for Users)

**Verification:**
```bash
aws lambda get-function-configuration --function-name admin-handler --region us-west-2 --query '[MemorySize,Timeout,Handler,Runtime,LastModified]' --output table
```

### Code Status
Latest code deployed includes:
- Module initialization logging (`========== MODULE INITIALIZATION START ==========`)
- Deployment marker: `2025-11-14T05:45:00.000Z-ROUTING-DEBUG`
- Top-level error handlers in exported handler
- Process-level uncaught exception handlers
- Extensive path logging and normalization
- Routes return test responses immediately (handler functions not called)
- Path comparison logging

## What We've Tried

1. **Added extensive logging** at every step:
   - Module initialization (immediately after imports)
   - Handler entry (`========== EXPORTED HANDLER CALLED ==========`)
   - Path normalization with detailed logging
   - Routing logic with path comparison checks
   - Function existence checks

2. **Simplified handler functions**:
   - Removed all DynamoDB calls
   - Return empty arrays immediately
   - Handler functions are commented out, routes return test responses
   - **Still no logs appear**

3. **Added error handlers**:
   - Top-level try-catch in exported handler
   - Process-level `uncaughtException` and `unhandledRejection` handlers
   - Routing-level error handlers
   - Path normalization error handlers

4. **Verified API Gateway routing**:
   - Confirmed all routes point to same Lambda
   - Confirmed integration types match
   - Confirmed function names match
   - Verified resource IDs exist

5. **Tested path matching**:
   - Added detailed path comparison logging
   - Routes return immediately without calling functions
   - Path normalization wrapped in try-catch
   - **Still no logs for whitelist/activity**

6. **Increased Lambda memory**:
   - Changed from 128MB to 512MB
   - **No improvement**

7. **Added memory usage logging**:
   - Log memory at module initialization
   - Log memory at handler entry
   - No memory errors visible

## Current Code State

### Routes Configuration
- `/v1/admin/whitelist` (GET) - Returns test response immediately:
  ```typescript
  return createResponse(200, {
    whitelistUsers: [],
    message: 'TEST: Route matched successfully, handler function not called yet',
    test: true
  });
  ```

- `/v1/admin/activity` (GET) - Returns test response immediately:
  ```typescript
  return createResponse(200, {
    activities: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    message: 'TEST: Route matched successfully, handler function not called yet',
    test: true
  });
  ```

### Handler Functions
- `handleListWhitelist()` - Defined but not called (commented out in routing)
- `handleGetActivityLogs()` - Defined but not called (commented out in routing)
- Both functions simplified to return empty data without DynamoDB calls

### Logging Added
- Module initialization logs (should appear for ALL invocations)
- Exported handler entry logs (should appear for ALL invocations)
- Path normalization logs
- Routing logic logs
- Path comparison logs

## What Should Happen (But Doesn't)

When whitelist/activity endpoints are called, we should see in CloudWatch:
1. `========== EXPORTED HANDLER CALLED ==========`
2. `========== ADMIN LAMBDA INVOCATION START ==========`
3. `========== ROUTING INFO ==========`
4. Path normalization logs
5. Either route match logs or "NO ROUTE MATCHED" logs

**But we see NONE of these logs.**

## Theories

1. **Lambda not being invoked** - But we get 500 errors, so API Gateway must be calling something
2. **Different Lambda function** - But we verified all routes point to same function
3. **Lambda crashing before handler runs** - But Users works, so module loads fine
4. **API Gateway caching/staging issue** - Possible but unlikely
5. **Lambda timeout** - 3 seconds is short, but Users works with same timeout
6. **Memory issue** - Increased to 512MB, no change
7. **Path normalization crash** - But Users path works fine
8. **Different API Gateway stage** - Users might hit one stage, whitelist/activity another
9. **Lambda function name mismatch** - Verified: integration shows `admin-handler`, actual function is `admin-handler`

## Key Files

- `lambdas/admin-handler/index.ts` - Main handler file with all logging
- Routes currently return test responses without calling handler functions
- Handler functions defined but commented out in routing logic

## Next Steps to Investigate

1. **Check API Gateway execution logs** (if enabled) to see if Lambda is actually being invoked
2. **Increase Lambda timeout** from 3 seconds to 30 seconds
3. **Check if there are multiple API Gateway stages** (dev/prod) - maybe routes point to different stages
4. **Test with direct Lambda invocation** (bypass API Gateway) to see if Lambda works:
   ```bash
   aws lambda invoke \
     --function-name admin-handler \
     --region us-west-2 \
     --payload '{"path":"/admin/whitelist","httpMethod":"GET","headers":{"Authorization":"Bearer YOUR_TOKEN"}}' \
     response.json
   ```
5. **Check CloudWatch Metrics** for the Lambda:
   - Errors count
   - Duration
   - Throttles
   - Memory utilization
6. **Verify API Gateway deployment** - Make sure changes are deployed to the correct stage
7. **Check API Gateway method responses** - Verify 500 error responses are configured correctly
8. **Check if there's a proxy integration issue** - Maybe whitelist/activity routes have different proxy settings

## Key Question

**Why does Users endpoint work and show logs, but whitelist/activity show NO logs at all, when all routes point to the same Lambda function with identical configurations?**

This suggests either:
- The Lambda isn't being invoked for those routes (API Gateway issue)
- The Lambda is crashing before ANY code runs (but why only for those routes?)
- There's a different Lambda or configuration we haven't found yet
- API Gateway is returning 500 before invoking Lambda (method response configuration issue)

## Code Location

- Handler: `lambdas/admin-handler/index.ts`
- Routes return test responses at lines ~274-278 (whitelist) and ~335-340 (activity)
- Handler functions defined but not called: `handleListWhitelist()` (~line 794), `handleGetActivityLogs()` (~line 1065)

