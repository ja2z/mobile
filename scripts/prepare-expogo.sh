#!/bin/bash

# Prepare app.json for Expo Go development
# Run this after TestFlight build to switch back to Expo Go

echo "🔄 Preparing app.json for Expo Go development..."
node scripts/toggle-app-domains.js expogo
echo "✅ Ready for Expo Go development"

