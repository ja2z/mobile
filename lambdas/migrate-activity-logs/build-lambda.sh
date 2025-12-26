#!/bin/bash

# Build Migration Lambda Function Script

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Cleaning previous build artifacts..."
if [ -f "migrate-activity-logs.zip" ]; then
  rm -f migrate-activity-logs.zip
  echo "  ✓ Removed migrate-activity-logs.zip"
fi

if [ -d "dist" ]; then
  rm -rf dist
  echo "  ✓ Removed dist/ directory"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo "📝 Copying index.js to root..."
cp dist/index.js index.js

echo ""
echo "🗜️  Creating migrate-activity-logs.zip..."
zip -r migrate-activity-logs.zip node_modules index.js

echo ""
echo "🧹 Cleaning up temporary files..."
rm -f index.js

echo ""
echo "✅ Build complete! migrate-activity-logs.zip is ready."

