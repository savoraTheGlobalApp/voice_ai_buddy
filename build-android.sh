#!/bin/bash

# Build script for Android APK with environment variables from .env.local
# Usage: ./build-android.sh

set -e  # Exit on error

echo "🔨 Building Android APK..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠️  Warning: .env.local not found. Make sure NEXT_PUBLIC_BACKEND_URL is set!"
    echo "   Create .env.local in the root directory with:"
    echo "   NEXT_PUBLIC_BACKEND_URL=https://your-railway-url"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Found .env.local"
    # Load environment variables from .env.local
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "📋 Backend URL: ${NEXT_PUBLIC_BACKEND_URL:-'NOT SET (will use localhost:8000)'}"
fi

# Build Next.js app (reads .env.local automatically)
echo ""
echo "📦 Building Next.js app..."
npm run build

# Sync Capacitor
echo ""
echo "🔄 Syncing Capacitor..."
npx cap sync android

# Build Android APK
echo ""
echo "🤖 Building Android APK..."
cd android
./gradlew.bat assembleDebug

echo ""
echo "✅ Build complete!"
echo "📱 APK location: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To install on device:"
echo "  adb install -r android/app/build/outputs/apk/debug/app-debug.apk"

