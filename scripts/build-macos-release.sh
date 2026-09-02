#!/bin/bash
# macOS Release Build Script for Microduck Habitat
# Usage: ./scripts/build-macos-release.sh

set -e

echo "=========================================="
echo "Microduck Habitat macOS Release Builder"
echo "=========================================="

# Check required env vars
if [ -z "$APPLE_ID" ]; then
  echo "❌ Error: APPLE_ID is not set"
  echo "   export APPLE_ID='your-apple-id@example.com'"
  exit 1
fi

if [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
  echo "❌ Error: APPLE_APP_SPECIFIC_PASSWORD is not set"
  echo ""
  echo "To generate an app-specific password:"
  echo "1. Visit https://appleid.apple.com"
  echo "2. Sign in with your Apple ID"
  echo "3. Go to 'Sign-In and Security' → 'App-Specific Passwords'"
  echo "4. Generate a new password (e.g., 'abcd-efgh-ijkl-mnop')"
  echo "5. Copy the password and set it:"
  echo "   export APPLE_APP_SPECIFIC_PASSWORD='your-password-here'"
  echo ""
  exit 1
fi

if [ -z "$APPLE_TEAM_ID" ]; then
  echo "❌ Error: APPLE_TEAM_ID is not set"
  echo "   export APPLE_TEAM_ID='YOURTEAMID'"
  exit 1
fi

echo "✅ Environment variables verified"
echo "   APPLE_ID: $APPLE_ID"
echo "   APPLE_TEAM_ID: $APPLE_TEAM_ID"
echo ""

# Clean and build
echo "🧹 Cleaning previous build artifacts..."
rm -rf release/*

echo "📦 Building signed and notarized release..."
npm run dist

echo ""
echo "=========================================="
echo "✅ Build complete!"
echo "=========================================="
echo ""
echo "Generated files in release/:"
ls -lh release/*.dmg release/*.zip 2>/dev/null || true
echo ""
echo "Next steps:"
echo "1. Test the DMG files on both Intel and Apple Silicon Macs"
echo "2. Run: npm run release:evidence && npm run verify:evidence"
echo "3. Create GitHub Release and upload the artifacts"
