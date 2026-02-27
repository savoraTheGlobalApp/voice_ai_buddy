#!/bin/bash

# Android Release APK Build Script
# Builds a production-ready APK for distribution

# Set Android Studio's JDK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# Set Android SDK location
export ANDROID_HOME="$HOME/Library/Android/sdk"

# Add Android tools to PATH
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "======================================"
echo "Building Release APK"
echo "======================================"
echo ""
echo "Environment configured:"
echo "  JAVA_HOME: $JAVA_HOME"
echo "  ANDROID_HOME: $ANDROID_HOME"
echo ""

# Build release APK using Expo
echo "Building release APK..."
npx expo run:android --variant release

# Check if build was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "✅ Build Successful!"
    echo "======================================"
    echo ""
    echo "Release APK location:"
    echo "  mobile/android/app/build/outputs/apk/release/app-release.apk"
    echo ""
    echo "To install on a connected device:"
    echo "  adb install -r android/app/build/outputs/apk/release/app-release.apk"
    echo ""
else
    echo ""
    echo "❌ Build failed. Check the error messages above."
    exit 1
fi
