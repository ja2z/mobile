#!/bin/bash

# Set API Gateway Rate Limits
# This script configures throttling and quotas for both API Gateways used by the mobile app

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verify authentication
echo "Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo -e "${RED}✗ ERROR: AWS CLI not authenticated${NC}"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi

echo -e "${GREEN}✓ AWS CLI authenticated${NC}"
echo ""

# API Gateway 1 Configuration
API_ID_1="qx7x0uioo1"
STAGE="v1"
REGION="us-west-2"

# API Gateway 1 throttling settings
RATE_LIMIT_1=1000      # requests per second
BURST_LIMIT_1=2000     # burst capacity
QUOTA_LIMIT_1=1000000  # requests per day

echo "=========================================="
echo "API Gateway 1: $API_ID_1"
echo "=========================================="
echo "Rate Limit: $RATE_LIMIT_1 requests/second"
echo "Burst Limit: $BURST_LIMIT_1 requests"
echo "Quota Limit: $QUOTA_LIMIT_1 requests/day"
echo ""

# Update API Gateway 1
echo "Updating throttling settings..."
# Note: Throttling must be set at method level using /*/* paths
cat > /tmp/stage-update-1.json << EOF
{
  "restApiId": "$API_ID_1",
  "stageName": "$STAGE",
  "patchOperations": [
    {"op": "replace", "path": "/*/*/throttling/burstLimit", "value": "$BURST_LIMIT_1"},
    {"op": "replace", "path": "/*/*/throttling/rateLimit", "value": "$RATE_LIMIT_1"}
  ]
}
EOF

aws_cmd apigateway update-stage --cli-input-json file:///tmp/stage-update-1.json --region $REGION

rm -f /tmp/stage-update-1.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Throttling configured successfully for API Gateway 1${NC}"
else
    echo -e "${RED}✗ Failed to configure throttling for API Gateway 1${NC}"
    exit 1
fi

echo ""
echo "Verifying configuration..."
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."*/*".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json

echo ""
echo ""

# API Gateway 2 Configuration
API_ID_2="3x4hwcq05f"

# API Gateway 2 throttling settings
RATE_LIMIT_2=500       # requests per second
BURST_LIMIT_2=1000     # burst capacity
QUOTA_LIMIT_2=500000   # requests per day

echo "=========================================="
echo "API Gateway 2: $API_ID_2"
echo "=========================================="
echo "Rate Limit: $RATE_LIMIT_2 requests/second"
echo "Burst Limit: $BURST_LIMIT_2 requests"
echo "Quota Limit: $QUOTA_LIMIT_2 requests/day"
echo ""

# Update API Gateway 2
echo "Updating throttling settings..."
# Note: Throttling must be set at method level using /*/* paths
cat > /tmp/stage-update-2.json << EOF
{
  "restApiId": "$API_ID_2",
  "stageName": "$STAGE",
  "patchOperations": [
    {"op": "replace", "path": "/*/*/throttling/burstLimit", "value": "$BURST_LIMIT_2"},
    {"op": "replace", "path": "/*/*/throttling/rateLimit", "value": "$RATE_LIMIT_2"}
  ]
}
EOF

aws_cmd apigateway update-stage --cli-input-json file:///tmp/stage-update-2.json --region $REGION

rm -f /tmp/stage-update-2.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Throttling configured successfully for API Gateway 2${NC}"
else
    echo -e "${RED}✗ Failed to configure throttling for API Gateway 2${NC}"
    exit 1
fi

echo ""
echo "Verifying configuration..."
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_2 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."*/*".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json

echo ""
echo ""
echo -e "${GREEN}=========================================="
echo "✓ Rate limiting configuration complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor CloudWatch metrics for throttling events"
echo "2. Test the API endpoints to ensure they work correctly"
echo "3. Adjust limits if needed based on actual usage patterns"
echo "4. Note: Quotas are not set via this script. Consider using AWS WAF or"
echo "   usage plans for additional quota controls if needed."
echo ""
echo "To verify configuration later, run:"
echo "  ./scripts/verify-rate-limits.sh"

