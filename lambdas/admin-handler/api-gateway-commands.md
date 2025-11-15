# API Gateway Verification Commands

## Quick Commands

### 1. List All Routes
```bash
aws apigatewayv2 get-routes \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query 'Items[*].[RouteKey,Target]' \
  --output table
```

### 2. Get Specific Route Details

#### Users Route:
```bash
aws apigatewayv2 get-routes \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query "Items[?RouteKey=='GET /admin/users']" \
  --output json
```

#### Whitelist Route:
```bash
aws apigatewayv2 get-routes \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query "Items[?RouteKey=='GET /admin/whitelist']" \
  --output json
```

#### Activity Route:
```bash
aws apigatewayv2 get-routes \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query "Items[?RouteKey=='GET /admin/activity']" \
  --output json
```

### 3. Get Integration Details (Which Lambda)

First, get the route ID:
```bash
ROUTE_ID=$(aws apigatewayv2 get-routes \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query "Items[?RouteKey=='GET /admin/whitelist'].RouteId" \
  --output text)

echo "Route ID: $ROUTE_ID"
```

Then get the integration:
```bash
INTEGRATION_ID=$(aws apigatewayv2 get-route \
  --api-id qx7x0uioo1 \
  --route-id $ROUTE_ID \
  --region us-west-2 \
  --query 'Target' \
  --output text | grep -o 'integrations/[^/]*' | cut -d'/' -f2)

aws apigatewayv2 get-integration \
  --api-id qx7x0uioo1 \
  --integration-id $INTEGRATION_ID \
  --region us-west-2 \
  --query 'IntegrationUri' \
  --output text
```

### 4. Compare All Three Routes Point to Same Lambda

```bash
API_ID="qx7x0uioo1"
REGION="us-west-2"

for route in "GET /admin/users" "GET /admin/whitelist" "GET /admin/activity"; do
  echo "=== $route ==="
  ROUTE_ID=$(aws apigatewayv2 get-routes --api-id $API_ID --region $REGION \
    --query "Items[?RouteKey=='$route'].RouteId" --output text)
  
  if [ ! -z "$ROUTE_ID" ] && [ "$ROUTE_ID" != "None" ]; then
    INTEGRATION_ID=$(aws apigatewayv2 get-route --api-id $API_ID --route-id $ROUTE_ID --region $REGION \
      --query 'Target' --output text | grep -o 'integrations/[^/]*' | cut -d'/' -f2)
    
    if [ ! -z "$INTEGRATION_ID" ]; then
      LAMBDA_ARN=$(aws apigatewayv2 get-integration --api-id $API_ID --integration-id $INTEGRATION_ID --region $REGION \
        --query 'IntegrationUri' --output text)
      echo "Lambda: $LAMBDA_ARN"
    else
      echo "No integration found"
    fi
  else
    echo "Route not found"
  fi
  echo ""
done
```

### 5. List All Integrations

```bash
aws apigatewayv2 get-integrations \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query 'Items[*].[IntegrationId,IntegrationUri,IntegrationType]' \
  --output table
```

### 6. Check API Gateway Stages

```bash
aws apigatewayv2 get-stages \
  --api-id qx7x0uioo1 \
  --region us-west-2 \
  --query 'Items[*].[StageName,DeploymentId,DefaultRouteSettings]' \
  --output table
```

## What to Look For

1. **All routes should exist**: Users, Whitelist, and Activity routes should all be present
2. **Same integration**: All three routes should point to the same Lambda function (`mobile-admin-handler`)
3. **Correct route keys**: Should match exactly:
   - `GET /admin/users`
   - `GET /admin/whitelist`
   - `GET /admin/activity`

## If Routes Are Missing or Point to Different Lambdas

This would explain why:
- Users works (has correct route/integration)
- Whitelist/Activity fail (missing route or wrong integration)

## Run the Full Check Script

```bash
cd lambdas/admin-handler
./check-api-gateway.sh
```

This will run all checks automatically and show you which Lambda each route points to.

