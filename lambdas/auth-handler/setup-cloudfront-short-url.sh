#!/bin/bash

# Setup CloudFront to route /s/* paths to API Gateway
# This allows short URLs like https://mobile.bigbuys.io/s/abc123 to work

set -e

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
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

DISTRIBUTION_ID="E1S5ZGZU7MITQR"
API_GATEWAY_DOMAIN="qx7x0uioo1.execute-api.us-west-2.amazonaws.com"
API_GATEWAY_STAGE="v1"
REGION="us-west-2"

echo "📋 CloudFront Distribution: $DISTRIBUTION_ID"
echo "📋 API Gateway Domain: $API_GATEWAY_DOMAIN"
echo ""

# Get current distribution config
echo "🔍 Getting current CloudFront distribution configuration..."
TMP_CONFIG=$(mktemp)
aws_cmd cloudfront get-distribution-config \
    --id "$DISTRIBUTION_ID" \
    --output json > "$TMP_CONFIG" 2>/dev/null

ETAG=$(python3 -c "import json; d=json.load(open('$TMP_CONFIG')); print(d['ETag'])" 2>/dev/null)

if [ -z "$ETAG" ]; then
    echo "❌ Error: Failed to get CloudFront distribution config"
    rm -f "$TMP_CONFIG"
    exit 1
fi

echo "✓ Got distribution config (ETag: $ETAG)"
echo ""

# Export variables for Python
export TMP_CONFIG
export API_GATEWAY_DOMAIN
export API_GATEWAY_STAGE

# Use Python to update the config
echo "📝 Updating CloudFront configuration..."
UPDATED_CONFIG=$(python3 << PYEOF
import json
import sys
import os

# Get variables from environment
tmp_config = os.environ.get('TMP_CONFIG', '')
api_gateway_domain = os.environ.get('API_GATEWAY_DOMAIN', '')
api_gateway_stage = os.environ.get('API_GATEWAY_STAGE', '')

# Read current config
with open(tmp_config) as f:
    data = json.load(f)

config = data['DistributionConfig']

# Check if API Gateway origin already exists
api_gateway_origin_id = "api-gateway-short-url"
origins = config.get('Origins', {}).get('Items', [])
origin_exists = any(o['Id'] == api_gateway_origin_id for o in origins)

if not origin_exists:
    # Add API Gateway as new origin
    new_origin = {
        "Id": api_gateway_origin_id,
        "DomainName": api_gateway_domain,
        "CustomOriginConfig": {
            "HTTPPort": 443,
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "https-only",
            "OriginSslProtocols": {
                "Quantity": 1,
                "Items": ["TLSv1.2"]
            },
            "OriginReadTimeout": 30,
            "OriginKeepaliveTimeout": 5
        },
        "OriginPath": f"/{api_gateway_stage}",
        "CustomHeaders": {
            "Quantity": 0,
            "Items": []
        }
    }
    origins.append(new_origin)
    config['Origins']['Items'] = origins
    config['Origins']['Quantity'] = len(origins)
    print("✓ Added API Gateway origin", file=sys.stderr)
else:
    print("✓ API Gateway origin already exists", file=sys.stderr)

# Check if /s/* cache behavior already exists
cache_behaviors = config.get('CacheBehaviors', {}).get('Items', [])
behavior_exists = any(cb.get('PathPattern') == '/s/*' for cb in cache_behaviors)

if not behavior_exists:
    # Create cache behavior for /s/*
    # Get the default cache behavior to copy some settings
    default_behavior = config.get('DefaultCacheBehavior', {})
    
    new_behavior = {
        "PathPattern": "/s/*",
        "TargetOriginId": api_gateway_origin_id,
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 3,
            "Items": ["GET", "HEAD", "OPTIONS"],
            "CachedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"]
            }
        },
        "Compress": True,
        "SmoothStreaming": False,
        "ForwardedValues": {
            "QueryString": True,
            "QueryStringCacheKeys": {
                "Quantity": 0,
                "Items": []
            },
            "Cookies": {"Forward": "none"},
            "Headers": {
                "Quantity": 0
            }
        },
        "MinTTL": 0,
        "DefaultTTL": 0,
        "MaxTTL": 0,
        "FieldLevelEncryptionId": "",
        "LambdaFunctionAssociations": {
            "Quantity": 0,
            "Items": []
        },
        "FunctionAssociations": {
            "Quantity": 0,
            "Items": []
        },
        "TrustedSigners": {
            "Enabled": False,
            "Quantity": 0
        },
        "TrustedKeyGroups": {
            "Enabled": False,
            "Quantity": 0
        }
    }
    
    # Only add ResponseHeadersPolicyId if it exists in default behavior (optional)
    if 'ResponseHeadersPolicyId' in default_behavior and default_behavior.get('ResponseHeadersPolicyId'):
        new_behavior["ResponseHeadersPolicyId"] = default_behavior['ResponseHeadersPolicyId']
    
    cache_behaviors.append(new_behavior)
    config['CacheBehaviors']['Items'] = cache_behaviors
    config['CacheBehaviors']['Quantity'] = len(cache_behaviors)
    print("✓ Added /s/* cache behavior", file=sys.stderr)
else:
    print("✓ /s/* cache behavior already exists", file=sys.stderr)

# Output updated config
print(json.dumps(config))
PYEOF
)

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to update CloudFront configuration"
    rm -f "$TMP_CONFIG"
    exit 1
fi

# Save updated config to file
UPDATED_CONFIG_FILE=$(mktemp)
echo "$UPDATED_CONFIG" > "$UPDATED_CONFIG_FILE"

# Get new ETag (required for update)
echo "🔍 Getting updated ETag..."
NEW_ETAG=$(aws_cmd cloudfront get-distribution-config \
    --id "$DISTRIBUTION_ID" \
    --query 'ETag' \
    --output text 2>/dev/null)

if [ -z "$NEW_ETAG" ]; then
    echo "❌ Error: Failed to get updated ETag"
    rm -f "$TMP_CONFIG" "$UPDATED_CONFIG_FILE"
    exit 1
fi

echo "✓ Got updated ETag: $NEW_ETAG"
echo ""

# Update distribution
echo "🚀 Updating CloudFront distribution..."
echo "   This will take ~15 minutes to deploy globally"
echo ""

aws_cmd cloudfront update-distribution \
    --id "$DISTRIBUTION_ID" \
    --if-match "$NEW_ETAG" \
    --distribution-config "file://$UPDATED_CONFIG_FILE" \
    --output json > /tmp/cloudfront-update-result.json 2>&1

if [ $? -eq 0 ]; then
    echo "✅ CloudFront distribution update initiated!"
    echo ""
    echo "📋 Update Status:"
    python3 << 'PYEOF'
import json
try:
    with open('/tmp/cloudfront-update-result.json') as f:
        content = f.read()
        # Handle case where there might be warnings before JSON
        if content.strip().startswith('warnings.warn'):
            # Find JSON start
            json_start = content.find('{')
            if json_start > 0:
                content = content[json_start:]
        result = json.loads(content)
        dist = result.get('Distribution', {})
        print(f"   Status: {dist.get('Status', 'N/A')}")
        print(f"   Domain: {dist.get('DomainName', 'N/A')}")
        print(f"   Last Modified: {dist.get('LastModifiedTime', 'N/A')}")
except Exception as e:
    print(f"   Update initiated (parsing error: {e})")
PYEOF
    echo ""
    echo "⏳ The distribution will take approximately 15 minutes to deploy globally."
    echo "   You can check status with:"
    echo "   aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status'"
    echo ""
    echo "✅ Once deployed, short URLs like https://mobile.bigbuys.io/s/abc123 will route to API Gateway!"
else
    echo "❌ Error: Failed to update CloudFront distribution"
    echo "   Check /tmp/cloudfront-update-result.json for details"
    rm -f "$TMP_CONFIG" "$UPDATED_CONFIG_FILE"
    exit 1
fi

# Cleanup
rm -f "$TMP_CONFIG" "$UPDATED_CONFIG_FILE"

