#!/bin/bash

# Build Lambda Function Script
# This script performs a clean build of the Lambda function and creates my-buys-handler.zip

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Cleaning previous build artifacts..."
# Remove existing zip file if it exists
if [ -f "my-buys-handler.zip" ]; then
  rm -f my-buys-handler.zip
  echo "  ✓ Removed my-buys-handler.zip"
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
# tsconfig.json pulls ../shared/**/*.ts into the compile set, which means
# tsc resolves `@aws-sdk/*` and `pg` imports in those files relative to
# ../shared/. On a fresh clone that folder has no node_modules and tsc
# fails with TS2307 even though my-buys-handler itself has the deps.
# Install them once here - no-op on subsequent builds.
if [ ! -d "../shared/node_modules" ]; then
  echo "📦 Installing shared dependencies (lambdas/shared)..."
  (cd ../shared && npm install)
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
# TypeScript preserves directory structure, so index.js is in dist/my-buys-handler/
# We need to copy it to root and fix the require paths for shared modules
if [ -f "dist/my-buys-handler/index.js" ]; then
  cp dist/my-buys-handler/index.js index.js
  echo "  ✓ Copied index.js to root"
  # Fix require paths: change '../shared/' to './shared/'
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed syntax
    sed -i '' 's|require("../shared/|require("./shared/|g' index.js
    sed -i '' "s|require('../shared/|require('./shared/|g" index.js
    sed -i '' 's|from "../shared/|from "./shared/|g' index.js
    sed -i '' "s|from '../shared/|from './shared/|g" index.js
  else
    # Linux sed syntax
    sed -i 's|require("../shared/|require("./shared/|g' index.js
    sed -i "s|require('../shared/|require('./shared/|g" index.js
    sed -i 's|from "../shared/|from "./shared/|g' index.js
    sed -i "s|from '../shared/|from './shared/|g" index.js
  fi
  echo "  ✓ Fixed require paths to use ./shared/"
  # Copy shared files to root level
  if [ -d "dist/shared" ]; then
    mkdir -p shared
    cp -r dist/shared/* shared/
    echo "  ✓ Copied shared files to root"
  else
    echo "  ⚠️  Warning: dist/shared directory not found!"
  fi
elif [ -f "dist/index.js" ]; then
  cp dist/index.js index.js
  echo "  ✓ Copied index.js to root"
  # Fix require paths if needed
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed syntax
    sed -i '' 's|require("../shared/|require("./shared/|g' index.js
    sed -i '' "s|require('../shared/|require('./shared/|g" index.js
    sed -i '' 's|from "../shared/|from "./shared/|g' index.js
    sed -i '' "s|from '../shared/|from './shared/|g" index.js
  else
    # Linux sed syntax
    sed -i 's|require("../shared/|require("./shared/|g' index.js
    sed -i "s|require('../shared/|require('./shared/|g" index.js
    sed -i 's|from "../shared/|from "./shared/|g' index.js
    sed -i "s|from '../shared/|from './shared/|g" index.js
  fi
  echo "  ✓ Fixed require paths to use ./shared/"
  # Copy shared files if they exist
  if [ -d "dist/shared" ]; then
    mkdir -p shared
    cp -r dist/shared/* shared/
    echo "  ✓ Copied shared files to root"
  else
    echo "  ⚠️  Warning: dist/shared directory not found!"
  fi
else
  echo "❌ Error: Could not find compiled index.js in dist/"
  exit 1
fi

echo ""
echo "🗜️  Creating my-buys-handler.zip..."
# Always package with index.js at root (Lambda expects this)
# Verify shared directory exists before zipping
if [ ! -d "shared" ]; then
  echo "❌ Error: shared directory not found! Cannot create zip without shared files."
  exit 1
fi
if [ ! -f "index.js" ]; then
  echo "❌ Error: index.js not found! Cannot create zip."
  exit 1
fi
zip -rq my-buys-handler.zip node_modules index.js shared

echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf shared index.js

echo ""
echo "✅ Build complete! my-buys-handler.zip is ready for upload."
echo "📦 File size: $(du -h my-buys-handler.zip | cut -f1)"
echo ""
echo "💡 To deploy, run:"
echo "   aws lambda update-function-code --function-name my-buys-handler --zip-file fileb://my-buys-handler.zip"

