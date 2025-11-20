#!/bin/bash

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

# Get account ID and region
ACCOUNT_ID=$(aws_cmd sts get-caller-identity --query 'Account' --output text)
REGION="us-west-2"
KEY_ALIAS="mobile-my-buys-secrets"

echo "Creating KMS customer-managed key for My Buys secrets encryption..."
echo "Account ID: $ACCOUNT_ID"
echo "Region: $REGION"
echo "Key Alias: $KEY_ALIAS"
echo ""

# Create the KMS key
echo "Creating KMS key..."
KEY_ID=$(aws_cmd kms create-key \
    --region $REGION \
    --description "KMS key for encrypting My Buys embed secrets in DynamoDB" \
    --key-usage ENCRYPT_DECRYPT \
    --key-spec SYMMETRIC_DEFAULT \
    --query 'KeyMetadata.KeyId' \
    --output text)

if [ $? -ne 0 ]; then
    echo "✗ Failed to create KMS key"
    exit 1
fi

echo "✓ KMS key created: $KEY_ID"

# Create alias for the key
echo "Creating key alias..."
aws_cmd kms create-alias \
    --region $REGION \
    --alias-name "alias/$KEY_ALIAS" \
    --target-key-id $KEY_ID

if [ $? -ne 0 ]; then
    echo "⚠ Warning: Failed to create alias (key may already exist)"
else
    echo "✓ Key alias created: alias/$KEY_ALIAS"
fi

# Get the key ARN for the policy
KEY_ARN=$(aws_cmd kms describe-key \
    --region $REGION \
    --key-id $KEY_ID \
    --query 'KeyMetadata.Arn' \
    --output text)

echo ""
echo "✓ KMS key setup complete!"
echo ""
echo "Key ID: $KEY_ID"
echo "Key ARN: $KEY_ARN"
echo "Key Alias: alias/$KEY_ALIAS"
echo ""
echo "Next steps:"
echo "1. Update Lambda IAM role to allow Encrypt/Decrypt on this key"
echo "2. Use key alias 'alias/$KEY_ALIAS' in Lambda environment variable KMS_KEY_ALIAS"
echo ""
echo "Example IAM policy statement to add to Lambda role:"
echo "{"
echo "  \"Effect\": \"Allow\","
echo "  \"Action\": ["
echo "    \"kms:Encrypt\","
echo "    \"kms:Decrypt\","
echo "    \"kms:DescribeKey\""
echo "  ],"
echo "  \"Resource\": \"$KEY_ARN\""
echo "}"

