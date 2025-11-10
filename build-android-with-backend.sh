#!/bin/bash
# Bash script to build Android APK with backend URL configuration
# Usage: ./build-android-with-backend.sh https://your-backend.railway.app

if [ -z "$1" ]; then
    echo "❌ Error: Backend URL is required"
    echo "Usage: ./build-android-with-backend.sh https://your-backend.railway.app"
    exit 1
fi

BACKEND_URL=$1

echo "🚀 Building Android APK with backend URL: $BACKEND_URL"

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "📝 Updating .env.local with backend URL..."
    # Update or add NEXT_PUBLIC_BACKEND_URL
    if grep -q "NEXT_PUBLIC_BACKEND_URL=" .env.local; then
        sed -i.bak "s|NEXT_PUBLIC_BACKEND_URL=.*|NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL|" .env.local
    else
        echo "NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL" >> .env.local
    fi
else
    echo "📝 Creating .env.local with backend URL..."
    echo "NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL" > .env.local
    echo "⚠️  WARNING: .env.local created with only backend URL. Make sure to add your Firebase configuration!"
fi

# Export for this session
export NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL

echo "🔨 Building Next.js app..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "🔄 Syncing with Capacitor..."
npm run android:sync

if [ $? -ne 0 ]; then
    echo "❌ Sync failed!"
    exit 1
fi

echo "📦 Building Android APK..."
cd android
./gradlew assembleDebug

if [ $? -ne 0 ]; then
    echo "❌ APK build failed!"
    cd ..
    exit 1
fi

cd ..

echo "✅ Build complete! APK location:"
echo "   android/app/build/outputs/apk/debug/app-debug.apk"

