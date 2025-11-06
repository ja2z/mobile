#!/bin/bash

# Build Lambda Function Script
# This script packages the Lambda function and creates generateSigmaEmbedURL.zip

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Cleaning previous build artifacts..."
# Remove existing zip file if it exists
if [ -f "generateSigmaEmbedURL.zip" ]; then
  rm -f generateSigmaEmbedURL.zip
  echo "  ✓ Removed generateSigmaEmbedURL.zip"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🗜️  Creating generateSigmaEmbedURL.zip..."
# Package index.js, package.json, and node_modules
zip -r generateSigmaEmbedURL.zip index.js package.json node_modules

echo ""
echo "✅ Build complete! generateSigmaEmbedURL.zip is ready for upload."
echo "📦 File size: $(du -h generateSigmaEmbedURL.zip | cut -f1)"
echo ""
echo "💡 To deploy, run:"
echo "   aws lambda update-function-code --function-name generateSigmaEmbedURL --zip-file fileb://generateSigmaEmbedURL.zip"

