#!/bin/bash

# Build Lambda Function Script
# This script performs a clean build of the Lambda function and creates mobile-auth-handler.zip

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Cleaning previous build artifacts..."
# Remove existing zip file if it exists
if [ -f "mobile-auth-handler.zip" ]; then
  rm -f mobile-auth-handler.zip
  echo "  ✓ Removed mobile-auth-handler.zip"
fi

# Remove dist directory if it exists
if [ -d "dist" ]; then
  rm -rf dist
  echo "  ✓ Removed dist/ directory"
fi

# Remove temporary index.js if it exists from previous failed build
if [ -f "index.js" ]; then
  rm -f index.js
  echo "  ✓ Removed temporary index.js"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo "📝 Copying compiled JavaScript..."
cp dist/index.js index.js

echo ""
echo "🗜️  Creating mobile-auth-handler.zip..."
zip -r mobile-auth-handler.zip node_modules index.js

echo ""
echo "🧹 Cleaning up temporary files..."
rm index.js

echo ""
echo "✅ Build complete! mobile-auth-handler.zip is ready for upload."
echo "📦 File size: $(du -h mobile-auth-handler.zip | cut -f1)"

