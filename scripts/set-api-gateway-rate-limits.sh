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
# General endpoints: More restrictive to prevent abuse
RATE_LIMIT_1=200       # requests per second (reduced from 1000)
BURST_LIMIT_1=400      # burst capacity (reduced from 2000)
QUOTA_LIMIT_1=1000000  # requests per day

# Short URL endpoints: Very strict limits to prevent brute force attacks
SHORT_URL_RATE_LIMIT=10    # requests per second (very restrictive)
SHORT_URL_BURST_LIMIT=20   # burst capacity (very restrictive)

# Phone validation endpoints: Strict limits to prevent SMS abuse
# These endpoints send SMS messages (costs money) and should be rate limited
PHONE_RATE_LIMIT=5         # requests per second (very restrictive - prevents SMS spam)
PHONE_BURST_LIMIT=10       # burst capacity (very restrictive)

echo "=========================================="
echo "API Gateway 1: $API_ID_1"
echo "=========================================="
echo "General Endpoints:"
echo "  Rate Limit: $RATE_LIMIT_1 requests/second"
echo "  Burst Limit: $BURST_LIMIT_1 requests"
echo ""
echo "Short URL Endpoints (/s/{shortId}, /v1/s/{shortId}, /auth/s/{shortId}):"
echo "  Rate Limit: $SHORT_URL_RATE_LIMIT requests/second"
echo "  Burst Limit: $SHORT_URL_BURST_LIMIT requests"
echo "  (Strict limits to prevent brute force attacks on magic links)"
echo ""
echo "Phone Validation Endpoints (/phone/validate, /phone/verify):"
echo "  Rate Limit: $PHONE_RATE_LIMIT requests/second"
echo "  Burst Limit: $PHONE_BURST_LIMIT requests"
echo "  (Strict limits to prevent SMS abuse and spam)"
echo ""
echo "Quota Limit: $QUOTA_LIMIT_1 requests/day"
echo ""

# Update API Gateway 1
echo "Updating throttling settings..."
# Note: Throttling must be set at method level
# First set general limits for all endpoints
cat > /tmp/stage-update-1.json << EOF
{
  "restApiId": "$API_ID_1",
  "stageName": "$STAGE",
  "patchOperations": [
    {"op": "replace", "path": "/*/*/throttling/burstLimit", "value": "$BURST_LIMIT_1"},
    {"op": "replace", "path": "/*/*/throttling/rateLimit", "value": "$RATE_LIMIT_1"},
    {"op": "replace", "path": "/s/{shortId}/GET/throttling/burstLimit", "value": "$SHORT_URL_BURST_LIMIT"},
    {"op": "replace", "path": "/s/{shortId}/GET/throttling/rateLimit", "value": "$SHORT_URL_RATE_LIMIT"},
    {"op": "replace", "path": "/v1/s/{shortId}/GET/throttling/burstLimit", "value": "$SHORT_URL_BURST_LIMIT"},
    {"op": "replace", "path": "/v1/s/{shortId}/GET/throttling/rateLimit", "value": "$SHORT_URL_RATE_LIMIT"},
    {"op": "replace", "path": "/auth/s/{shortId}/GET/throttling/burstLimit", "value": "$SHORT_URL_BURST_LIMIT"},
    {"op": "replace", "path": "/auth/s/{shortId}/GET/throttling/rateLimit", "value": "$SHORT_URL_RATE_LIMIT"},
    {"op": "replace", "path": "/phone/validate/POST/throttling/burstLimit", "value": "$PHONE_BURST_LIMIT"},
    {"op": "replace", "path": "/phone/validate/POST/throttling/rateLimit", "value": "$PHONE_RATE_LIMIT"},
    {"op": "replace", "path": "/phone/verify/POST/throttling/burstLimit", "value": "$PHONE_BURST_LIMIT"},
    {"op": "replace", "path": "/phone/verify/POST/throttling/rateLimit", "value": "$PHONE_RATE_LIMIT"},
    {"op": "replace", "path": "/v1/phone/validate/POST/throttling/burstLimit", "value": "$PHONE_BURST_LIMIT"},
    {"op": "replace", "path": "/v1/phone/validate/POST/throttling/rateLimit", "value": "$PHONE_RATE_LIMIT"},
    {"op": "replace", "path": "/v1/phone/verify/POST/throttling/burstLimit", "value": "$PHONE_BURST_LIMIT"},
    {"op": "replace", "path": "/v1/phone/verify/POST/throttling/rateLimit", "value": "$PHONE_RATE_LIMIT"}
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
echo "Verifying general endpoint configuration..."
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."*/*".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json

echo ""
echo "Verifying short URL endpoint configuration..."
echo "  /s/{shortId}/GET:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/s/{shortId}/GET".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo "  /v1/s/{shortId}/GET:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/v1/s/{shortId}/GET".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo "  /auth/s/{shortId}/GET:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/auth/s/{shortId}/GET".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo ""
echo "Verifying phone validation endpoint configuration..."
echo "  /phone/validate/POST:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/phone/validate/POST".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo "  /phone/verify/POST:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/phone/verify/POST".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo "  /v1/phone/validate/POST:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/v1/phone/validate/POST".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo "  /v1/phone/verify/POST:"
aws_cmd apigateway get-stage \
    --rest-api-id $API_ID_1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."/v1/phone/verify/POST".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json 2>/dev/null || echo "    (Not configured or using default)"

echo ""
echo ""

# API Gateway 2 Configuration
API_ID_2="3x4hwcq05f"

# API Gateway 2 throttling settings
# More restrictive limits for second API Gateway
RATE_LIMIT_2=200       # requests per second (reduced from 500)
BURST_LIMIT_2=400      # burst capacity (reduced from 1000)
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
echo -e "${YELLOW}Security Improvements:${NC}"
echo "  • General endpoints: Reduced to 200 req/sec (from 1000) to prevent abuse"
echo "  • Short URL endpoints: Strict 10 req/sec limit to prevent brute force attacks"
echo "  • Short URL endpoints protect magic link authentication tokens"
echo "  • Phone validation endpoints: Very strict 5 req/sec limit to prevent SMS abuse"
echo "  • Phone endpoints protect against SMS spam and cost abuse"
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

