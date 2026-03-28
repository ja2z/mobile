#!/bin/bash

# Deploy Lambda via S3 (faster for large files)
# This script uploads the Lambda zip to S3, then updates Lambda to use it

set -e  # Exit on any error

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper to filter warnings
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning\|warnings.warn(" >&2)
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
FUNCTION_NAME="admin-handler"
REGION="us-west-2"
S3_BUCKET="mobile-lambda-deployments"
S3_KEY="admin-handler/${FUNCTION_NAME}-$(date +%Y%m%d-%H%M%S).zip"
ZIP_FILE="admin-handler.zip"

# Verify authentication
echo "🔐 Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

# Check if zip file exists
if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Error: $ZIP_FILE not found!"
    echo "   Run ./build-lambda.sh first to create the zip file"
    exit 1
fi

# Create S3 bucket if it doesn't exist (idempotent)
echo "📦 Checking S3 bucket: $S3_BUCKET"
if ! aws_cmd s3 ls "s3://${S3_BUCKET}" > /dev/null 2>&1; then
    echo "   Bucket doesn't exist, creating..."
    aws_cmd s3 mb "s3://${S3_BUCKET}" --region "$REGION"
    echo "   ✓ Bucket created"
else
    echo "   ✓ Bucket exists"
fi
echo ""

# Upload zip to S3
echo "📤 Uploading $ZIP_FILE to S3..."
echo "   Bucket: s3://${S3_BUCKET}/${S3_KEY}"
aws_cmd s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${S3_KEY}"
echo "   ✓ Upload complete"
echo ""

# Update Lambda function to use S3 location
echo "🚀 Updating Lambda function: $FUNCTION_NAME"
aws_cmd lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --s3-bucket "$S3_BUCKET" \
    --s3-key "$S3_KEY" \
    --query '[FunctionName,CodeSha256,LastUpdateStatus]' \
    --output table

echo ""
echo "⏳ Waiting for deployment to complete..."
sleep 3

# Check deployment status
STATUS=$(aws_cmd lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'LastUpdateStatus' \
    --output text)

if [ "$STATUS" = "Successful" ]; then
    echo "✅ Deployment successful!"
elif [ "$STATUS" = "InProgress" ]; then
    echo "⏳ Deployment in progress... (check status with: aws lambda get-function-configuration --function-name $FUNCTION_NAME --query 'LastUpdateStatus')"
else
    echo "⚠️  Deployment status: $STATUS"
    echo "   Check CloudWatch logs for details"
fi

echo ""
echo "💡 To clean up old S3 objects (optional):"
echo "   aws s3 rm s3://${S3_BUCKET}/admin-handler/ --recursive --exclude '*.zip' --include '*.zip' --dryrun"

