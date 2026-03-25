#!/bin/bash
# Start Expo dev server for development builds (expo-dev-client).
# Usage: ./scripts/start-expo-dev-client.sh  (from repo root or any cwd)

set -e
cd "$(dirname "$0")/.."
exec npx expo start --dev-client
