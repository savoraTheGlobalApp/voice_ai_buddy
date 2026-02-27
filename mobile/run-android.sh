#!/bin/bash

# Android Build & Emulator Script
# This script sets up the environment and builds the Android app for local testing

# Set Android Studio's JDK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# Set Android SDK location
export ANDROID_HOME="$HOME/Library/Android/sdk"

# Add Android tools to PATH
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "Environment configured:"
echo "  JAVA_HOME: $JAVA_HOME"
echo "  ANDROID_HOME: $ANDROID_HOME"
echo ""

# Check if emulator is running
EMULATOR_RUNNING=$(adb devices | grep "emulator" | wc -l)

if [ "$EMULATOR_RUNNING" -eq 0 ]; then
    echo "No emulator detected. Starting emulator..."
    echo "Available emulators:"
    emulator -list-avds
    echo ""
    echo "To start a specific emulator, run:"
    echo "  emulator -avd <emulator-name> &"
    echo ""
    read -p "Press Enter to continue with build (make sure an emulator is running)..."
fi

echo "Building and installing Android app..."
npm run android
