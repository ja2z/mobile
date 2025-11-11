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
# TypeScript preserves directory structure, so index.js is in dist/auth-handler/
# We need to maintain the directory structure for require('../shared/...') to work
if [ -f "dist/auth-handler/index.js" ]; then
  mkdir -p auth-handler
  cp dist/auth-handler/index.js auth-handler/index.js
  # Copy shared files to maintain require('../shared/...') paths
  if [ -d "dist/shared" ]; then
    mkdir -p shared
    cp -r dist/shared/* shared/
    echo "  ✓ Copied shared files"
  fi
elif [ -f "dist/index.js" ]; then
  cp dist/index.js index.js
  # Copy shared files if they exist
  if [ -d "dist/shared" ]; then
    mkdir -p shared
    cp -r dist/shared/* shared/
    echo "  ✓ Copied shared files"
  fi
else
  echo "❌ Error: Could not find compiled index.js in dist/"
  exit 1
fi

echo ""
echo "🗜️  Creating mobile-auth-handler.zip..."
if [ -f "auth-handler/index.js" ]; then
  # Include directory structure for proper require paths
  zip -r mobile-auth-handler.zip node_modules auth-handler shared
else
  zip -r mobile-auth-handler.zip node_modules index.js shared
fi

echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf auth-handler shared index.js

echo ""
echo "✅ Build complete! mobile-auth-handler.zip is ready for upload."
echo "📦 File size: $(du -h mobile-auth-handler.zip | cut -f1)"

