#!/bin/bash

# Prepare app.json for TestFlight build
# Run this before: npx expo prebuild --platform ios --clean

echo "🔄 Preparing app.json for TestFlight build..."
node scripts/toggle-app-domains.js testflight
echo "✅ Ready for TestFlight build"
echo ""
echo "Now run: npx expo prebuild --platform ios --clean"

