#!/bin/bash

# Verify API Gateway Rate Limits
# This script checks the current throttling and quota settings for both API Gateways

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

REGION="us-west-2"
STAGE="v1"

# Check API Gateway 1
echo "=========================================="
echo "API Gateway 1: qx7x0uioo1"
echo "=========================================="
CONFIG_1=$(aws_cmd apigateway get-stage \
    --rest-api-id qx7x0uioo1 \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."*/*".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json)

echo "$CONFIG_1" | jq '.'

# Check if limits are configured
BURST_1=$(echo "$CONFIG_1" | jq -r '.throttlingBurstLimit // "null"')
RATE_1=$(echo "$CONFIG_1" | jq -r '.throttlingRateLimit // "null"')
QUOTA_1="N/A"  # Quotas not set via method settings

if [ "$BURST_1" = "null" ] || [ "$RATE_1" = "null" ]; then
    echo -e "${RED}⚠ WARNING: Rate limits not fully configured${NC}"
else
    echo -e "${GREEN}✓ Rate limits are configured${NC}"
fi

echo ""
echo ""

# Check API Gateway 2
echo "=========================================="
echo "API Gateway 2: 3x4hwcq05f"
echo "=========================================="
CONFIG_2=$(aws_cmd apigateway get-stage \
    --rest-api-id 3x4hwcq05f \
    --stage-name $STAGE \
    --region $REGION \
    --query 'methodSettings."*/*".{throttlingBurstLimit:throttlingBurstLimit,throttlingRateLimit:throttlingRateLimit}' \
    --output json)

echo "$CONFIG_2" | jq '.'

# Check if limits are configured
BURST_2=$(echo "$CONFIG_2" | jq -r '.throttlingBurstLimit // "null"')
RATE_2=$(echo "$CONFIG_2" | jq -r '.throttlingRateLimit // "null"')
QUOTA_2="N/A"  # Quotas not set via method settings

if [ "$BURST_2" = "null" ] || [ "$RATE_2" = "null" ]; then
    echo -e "${RED}⚠ WARNING: Rate limits not fully configured${NC}"
else
    echo -e "${GREEN}✓ Rate limits are configured${NC}"
fi

echo ""
echo ""

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="

if [ "$BURST_1" != "null" ] && [ "$RATE_1" != "null" ] && \
   [ "$BURST_2" != "null" ] && [ "$RATE_2" != "null" ]; then
    echo -e "${GREEN}✓ Both API Gateways have rate limits configured${NC}"
else
    echo -e "${YELLOW}⚠ Some API Gateways are missing rate limits${NC}"
    echo ""
    echo "To configure rate limits, run:"
    echo "  ./scripts/set-api-gateway-rate-limits.sh"
fi

