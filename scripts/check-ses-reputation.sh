#!/bin/bash

# Check SES Reputation and Configuration
# Diagnoses why emails might be going to spam after VPC migration

set -e

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI command wrapper
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

REGION="us-west-2"
FROM_EMAIL="hello@bigbuys.io"

echo "=========================================="
echo "SES Reputation & Configuration Check"
echo "=========================================="
echo ""

# Verify authentication before proceeding
echo "🔐 Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

# 1. Check SES Account Sending Status
echo "📊 1. Checking SES Account Status..."
echo "----------------------------------------"
ACCOUNT_STATUS=$(aws_cmd ses get-account-sending-enabled \
    --region "$REGION" \
    --output json 2>&1)

if echo "$ACCOUNT_STATUS" | grep -q "true"; then
    echo "✓ Account sending is ENABLED"
else
    echo "✗ Account sending is DISABLED"
fi

# Check if in sandbox mode
SEND_QUOTA=$(aws_cmd ses get-send-quota \
    --region "$REGION" \
    --output json 2>&1)

MAX_24H=$(echo "$SEND_QUOTA" | python3 -c "import sys, json; print(json.load(sys.stdin).get('Max24HourSend', 'N/A'))" 2>/dev/null || echo "N/A")
MAX_SEND_RATE=$(echo "$SEND_QUOTA" | python3 -c "import sys, json; print(json.load(sys.stdin).get('MaxSendRate', 'N/A'))" 2>/dev/null || echo "N/A")

echo "   Max 24h Send: $MAX_24H"
echo "   Max Send Rate: $MAX_SEND_RATE"
if [ "$MAX_24H" = "200" ]; then
    echo "   ⚠️  WARNING: Account appears to be in SANDBOX mode (200/day limit)"
else
    echo "   ✓ Account is out of sandbox"
fi
echo ""

# 2. Check Identity Verification
echo "📧 2. Checking Identity Verification..."
echo "----------------------------------------"
# Check email identity
EMAIL_IDENTITY_RAW=$(aws_cmd ses get-identity-verification-attributes \
    --identities "$FROM_EMAIL" \
    --region "$REGION" \
    --output json 2>&1)

EMAIL_STATUS=$(echo "$EMAIL_IDENTITY_RAW" | python3 -c "
import sys, json
try:
    # Filter out warning lines and empty lines, then parse JSON
    lines = []
    for line in sys.stdin:
        line = line.strip()
        if line and 'InsecureRequestWarning' not in line and 'warnings.warn' not in line:
            lines.append(line)
    content = ''.join(lines)
    if not content or content[0] != '{':
        print('NOT_FOUND')
        sys.exit(0)
    data = json.loads(content)
    attrs = data.get('VerificationAttributes', {}).get('$FROM_EMAIL', {})
    print(attrs.get('VerificationStatus', 'NOT_FOUND'))
except Exception as e:
    print('NOT_FOUND')
" 2>/dev/null || echo "NOT_FOUND")

# Check domain identity
DOMAIN="bigbuys.io"
DOMAIN_IDENTITY_RAW=$(aws_cmd ses get-identity-verification-attributes \
    --identities "$DOMAIN" \
    --region "$REGION" \
    --output json 2>&1)

DOMAIN_STATUS=$(echo "$DOMAIN_IDENTITY_RAW" | python3 -c "
import sys, json
try:
    # Filter out warning lines and empty lines, then parse JSON
    lines = []
    for line in sys.stdin:
        line = line.strip()
        if line and 'InsecureRequestWarning' not in line and 'warnings.warn' not in line:
            lines.append(line)
    content = ''.join(lines)
    if not content or content[0] != '{':
        print('NOT_FOUND')
        sys.exit(0)
    data = json.loads(content)
    attrs = data.get('VerificationAttributes', {}).get('$DOMAIN', {})
    print(attrs.get('VerificationStatus', 'NOT_FOUND'))
except Exception as e:
    print('NOT_FOUND')
" 2>/dev/null || echo "NOT_FOUND")

if [ "$EMAIL_STATUS" = "Success" ]; then
    echo "✓ Email identity verified: $FROM_EMAIL"
elif [ "$DOMAIN_STATUS" = "Success" ]; then
    echo "✓ Domain identity verified: $DOMAIN (covers $FROM_EMAIL)"
else
    echo "⚠️  Email identity status: $EMAIL_STATUS"
    echo "⚠️  Domain identity status: $DOMAIN_STATUS"
    echo "   Note: If domain is verified, email addresses are automatically verified"
fi
echo ""

# 3. Check Recent Sending Statistics
echo "📈 3. Checking Recent Sending Statistics (last 2 weeks)..."
echo "----------------------------------------"
SEND_STATS_RAW=$(aws_cmd ses get-send-statistics \
    --region "$REGION" \
    --output json 2>&1)

# Filter for recent data points (last 2 weeks)
RECENT_STATS=$(echo "$SEND_STATS_RAW" | python3 << 'PYTHON_SCRIPT'
import sys, json
from datetime import datetime, timedelta

try:
    # Filter out warning lines and empty lines, then parse JSON
    lines = []
    for line in sys.stdin:
        line = line.strip()
        if line and 'InsecureRequestWarning' not in line and 'warnings.warn' not in line:
            lines.append(line)
    content = ''.join(lines)
    if not content or content[0] != '{':
        print("[]")
        sys.exit(0)
    data = json.loads(content)
    data_points = data.get('SendDataPoints', [])
    
    # Filter for last 2 weeks
    two_weeks_ago = datetime.now() - timedelta(days=14)
    
    recent = []
    for point in data_points:
        timestamp_str = point['Timestamp']
        # Handle both formats: "2025-12-16T19:07:00+00:00" and "2025-12-16T19:07:00Z"
        if timestamp_str.endswith('Z'):
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        else:
            timestamp = datetime.fromisoformat(timestamp_str)
        
        if timestamp.replace(tzinfo=None) >= two_weeks_ago:
            recent.append(point)
    
    # Sort by timestamp
    recent.sort(key=lambda x: x['Timestamp'])
    
    if recent:
        print(json.dumps(recent, indent=2))
    else:
        print("[]")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    print("[]")
PYTHON_SCRIPT
)

if [ "$(echo "$RECENT_STATS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")" -gt 0 ]; then
    echo "Recent sending statistics:"
    echo "$RECENT_STATS" | python3 << 'PYTHON_SCRIPT'
import sys, json

data = json.load(sys.stdin)
if not data:
    print("  No recent data")
    sys.exit(0)

# Calculate totals
total_sent = sum(p.get('DeliveryAttempts', 0) for p in data)
total_bounces = sum(p.get('Bounces', 0) for p in data)
total_complaints = sum(p.get('Complaints', 0) for p in data)
total_rejects = sum(p.get('Rejects', 0) for p in data)

print(f"  Total Delivery Attempts: {total_sent}")
print(f"  Total Bounces: {total_bounces}")
print(f"  Total Complaints: {total_complaints}")
print(f"  Total Rejects: {total_rejects}")

if total_sent > 0:
    bounce_rate = (total_bounces / total_sent) * 100
    complaint_rate = (total_complaints / total_sent) * 100
    reject_rate = (total_rejects / total_sent) * 100
    
    print(f"  Bounce Rate: {bounce_rate:.2f}%")
    print(f"  Complaint Rate: {complaint_rate:.2f}%")
    print(f"  Reject Rate: {reject_rate:.2f}%")
    
    if bounce_rate > 5.0:
        print("  ⚠️  WARNING: Bounce rate > 5% - this can cause spam filtering")
    if complaint_rate > 0.1:
        print("  ⚠️  WARNING: Complaint rate > 0.1% - this can cause spam filtering")
    if reject_rate > 0:
        print("  ⚠️  WARNING: Rejects detected - check SES configuration")
else:
    print("  No emails sent in the last 2 weeks")
PYTHON_SCRIPT
else
    echo "  No recent sending statistics found"
fi
echo ""

# 4. Check Configuration Sets
echo "⚙️  4. Checking Configuration Sets..."
echo "----------------------------------------"
CONFIG_SETS=$(aws_cmd ses list-configuration-sets \
    --region "$REGION" \
    --output json 2>&1)

CONFIG_SET_COUNT=$(echo "$CONFIG_SETS" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('ConfigurationSets', [])))" 2>/dev/null || echo "0")

if [ "$CONFIG_SET_COUNT" -gt 0 ]; then
    echo "✓ Found $CONFIG_SET_COUNT configuration set(s):"
    echo "$CONFIG_SETS" | python3 -c "import sys, json; [print(f'  - {cs[\"Name\"]}') for cs in json.load(sys.stdin).get('ConfigurationSets', [])]" 2>/dev/null || echo "  (error parsing)"
else
    echo "  No configuration sets found (using default SES behavior)"
    echo "  💡 Consider creating a configuration set for better reputation control"
fi
echo ""

# 5. Check NAT Gateway IP (for reference)
echo "🌐 5. Checking NAT Gateway Configuration..."
echo "----------------------------------------"
# Find NAT Gateway used by Lambda (check route tables)
NAT_GATEWAYS=$(aws_cmd ec2 describe-nat-gateways \
    --region "$REGION" \
    --output json 2>&1 | grep -v "InsecureRequestWarning")

# Get the primary NAT Gateway (the one mentioned in docs)
NAT_GATEWAY_ID="nat-03f520c432722ce47"
NAT_INFO_RAW=$(aws_cmd ec2 describe-nat-gateways \
    --nat-gateway-ids "$NAT_GATEWAY_ID" \
    --region "$REGION" \
    --output json 2>&1)

NAT_IP=$(echo "$NAT_INFO_RAW" | python3 -c "
import sys, json
try:
    # Filter out warning lines and empty lines, then parse JSON
    lines = []
    for line in sys.stdin:
        line = line.strip()
        if line and 'InsecureRequestWarning' not in line and 'warnings.warn' not in line:
            lines.append(line)
    content = ''.join(lines)
    if not content or content[0] != '{':
        print('N/A')
        sys.exit(0)
    nat = json.loads(content).get('NatGateways', [{}])[0]
    addresses = nat.get('NatGatewayAddresses', [])
    if addresses:
        print(addresses[0].get('PublicIp', 'N/A'))
    else:
        print('N/A')
except:
    print('N/A')
" 2>/dev/null || echo "N/A")

NAT_STATE=$(echo "$NAT_INFO_RAW" | python3 -c "
import sys, json
try:
    # Filter out warning lines and empty lines, then parse JSON
    lines = []
    for line in sys.stdin:
        line = line.strip()
        if line and 'InsecureRequestWarning' not in line and 'warnings.warn' not in line:
            lines.append(line)
    content = ''.join(lines)
    if not content or content[0] != '{':
        print('N/A')
        sys.exit(0)
    nat = json.loads(content).get('NatGateways', [{}])[0]
    print(nat.get('State', 'N/A'))
except:
    print('N/A')
" 2>/dev/null || echo "N/A")

if [ "$NAT_STATE" = "available" ]; then
    echo "✓ NAT Gateway is available"
    echo "  NAT Gateway ID: $NAT_GATEWAY_ID"
    echo "  Public IP: $NAT_IP"
    echo "  Note: This IP is used for Lambda→SES API calls, but SES uses its own IPs for sending emails"
else
    echo "⚠️  NAT Gateway state: $NAT_STATE"
fi
echo ""

# 6. Summary and Recommendations
echo "=========================================="
echo "Summary & Recommendations"
echo "=========================================="
echo ""

# Check if there are any red flags
RED_FLAGS=0

if [ "$MAX_24H" = "200" ]; then
    echo "⚠️  Account is in SANDBOX mode - request production access"
    RED_FLAGS=$((RED_FLAGS + 1))
fi

if [ "$EMAIL_STATUS" != "Success" ] && [ "$DOMAIN_STATUS" != "Success" ]; then
    echo "⚠️  Email/Domain identity not verified"
    RED_FLAGS=$((RED_FLAGS + 1))
fi

if [ "$CONFIG_SET_COUNT" -eq 0 ]; then
    echo "💡 Consider creating a SES Configuration Set for better reputation control"
fi

if [ "$RED_FLAGS" -eq 0 ]; then
    echo "✓ No obvious configuration issues found"
    echo ""
    echo "Since SPF/DKIM/DMARC all pass, the issue is likely:"
    echo "  1. IP reputation - SES may be using different IPs after VPC migration"
    echo "  2. Sending pattern change - Gmail may need time to adjust"
    echo "  3. User-level reputation - recipients need to mark as 'Not Spam'"
    echo ""
    echo "Recommended actions:"
    echo "  1. Have recipients mark emails as 'Not Spam' (trains Gmail)"
    echo "  2. Gradually increase sending volume to warm up reputation"
    echo "  3. Check Google Postmaster Tools for domain/IP reputation"
    echo "  4. Consider using SES Configuration Sets with dedicated IPs"
fi

echo ""
echo "✅ Diagnostic complete"

