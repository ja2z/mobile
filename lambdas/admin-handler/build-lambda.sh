#!/bin/bash

# Build Lambda Function Script
# This script performs a clean build of the Lambda function and creates admin-handler.zip
# Note: This includes shared code from ../shared/ which is compiled via tsconfig.json

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Cleaning previous build artifacts..."
# Remove existing zip file if it exists
if [ -f "admin-handler.zip" ]; then
  rm -f admin-handler.zip
  echo "  ✓ Removed admin-handler.zip"
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
echo "  Note: This will compile shared code from ../shared/ into dist/"
npm run build

echo ""
echo "📝 Copying compiled JavaScript..."
# TypeScript preserves directory structure, so index.js is in dist/admin-handler/
if [ -f "dist/admin-handler/index.js" ]; then
  cp dist/admin-handler/index.js index.js
elif [ -f "dist/index.js" ]; then
  cp dist/index.js index.js
else
  echo "❌ Error: Could not find compiled index.js in dist/"
  exit 1
fi

echo ""
echo "🗜️  Creating admin-handler.zip..."
zip -r admin-handler.zip node_modules index.js

echo ""
echo "🧹 Cleaning up temporary files..."
rm index.js

echo ""
echo "✅ Build complete! admin-handler.zip is ready for upload."
echo "📦 File size: $(du -h admin-handler.zip | cut -f1)"
echo ""
echo "💡 To deploy, run:"
echo "   aws lambda update-function-code --function-name mobile-admin-handler --zip-file fileb://admin-handler.zip"

