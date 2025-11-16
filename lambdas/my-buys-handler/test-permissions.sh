#!/bin/bash

# Test script to verify Lambda permissions for secrets table

set -e

export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

ROLE_ARN="arn:aws:iam::763903610969:role/mobile-my-buys-lambda-role"
SECRETS_TABLE_ARN="arn:aws:dynamodb:us-west-2:763903610969:table/mobile-my-buys-secrets"

echo "Testing Lambda permissions for secrets table..."
echo "Role: $ROLE_ARN"
echo "Table: $SECRETS_TABLE_ARN"
echo ""

echo "1. Testing dynamodb:GetItem permission..."
aws_cmd iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "dynamodb:GetItem" \
    --resource-arns "$SECRETS_TABLE_ARN" \
    --query 'EvaluationResults[0].EvalDecision' \
    --output text

echo ""
echo "2. Testing dynamodb:PutItem permission..."
aws_cmd iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "dynamodb:PutItem" \
    --resource-arns "$SECRETS_TABLE_ARN" \
    --query 'EvaluationResults[0].EvalDecision' \
    --output text

echo ""
echo "3. Testing dynamodb:UpdateItem permission..."
aws_cmd iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "dynamodb:UpdateItem" \
    --resource-arns "$SECRETS_TABLE_ARN" \
    --query 'EvaluationResults[0].EvalDecision' \
    --output text

echo ""
echo "4. Verifying current IAM policy includes secrets table..."
if aws_cmd iam get-role-policy \
    --role-name mobile-my-buys-lambda-role \
    --policy-name mobile-my-buys-lambda-policy \
    --query 'PolicyDocument.Statement[0].Resource' \
    --output text | grep -q "mobile-my-buys-secrets"; then
    echo "✓ Policy includes mobile-my-buys-secrets table"
else
    echo "✗ Policy does NOT include mobile-my-buys-secrets table"
    exit 1
fi

echo ""
echo "✅ Permission tests complete!"

