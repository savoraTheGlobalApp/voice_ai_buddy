# Android Build Instructions

## Prerequisites

1. **Android Studio** installed with Android SDK
2. **Java 11 or 17** installed
3. **Physical Android device** with USB debugging enabled (recommended)
4. **ADB** (Android Debug Bridge) installed and in PATH

## Environment Setup

### 1. Create `.env.local` file in project root

Create a file named `.env.local` in the root directory with your backend URL:

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-railway-app.up.railway.app
```

**Important:** 
- Use `https://` (not `http://`) - Android blocks cleartext HTTP by default
- Replace `your-railway-app.up.railway.app` with your actual Railway URL
- This file is gitignored, so it won't be committed to GitHub

### 2. Verify `.env.local` exists

```bash
cat .env.local
```

You should see:
```
NEXT_PUBLIC_BACKEND_URL=https://your-railway-url
```

## Building the APK (Git Bash)

### Option 1: Using the build script (Recommended)

```bash
# Make script executable (first time only)
chmod +x build-android.sh

# Run the build script
./build-android.sh
```

### Option 2: Manual build steps

```bash
# 1. Load environment variables from .env.local
export $(cat .env.local | grep -v '^#' | xargs)

# 2. Verify backend URL is loaded
echo "Backend URL: $NEXT_PUBLIC_BACKEND_URL"

# 3. Build Next.js app (reads .env.local automatically)
npm run build

# 4. Sync Capacitor
npx cap sync android

# 5. Build Android APK
cd android
./gradlew.bat assembleDebug
cd ..
```

## Installing on Device

### Check device connection

```bash
adb devices
```

You should see your device listed. If not:
1. Enable USB debugging on your Android device
2. Accept the USB debugging prompt on your device
3. Run `adb devices` again

### Install APK

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or use Android Studio:
1. Open `android/` folder in Android Studio
2. Click Run ▶ button
3. Select your device

## Troubleshooting

### Backend not connecting

1. **Check backend URL in logs:**
   - Open Android Studio Logcat
   - Look for `[Realtime] Using backend URL:` or `[STT Config] Using backend URL:`
   - Verify it shows your Railway URL, not `http://localhost:8000`

2. **Rebuild with correct URL:**
   ```bash
   # Make sure .env.local has the correct URL
   cat .env.local
   
   # Rebuild
   ./build-android.sh
   ```

3. **Check CORS on backend:**
   - Backend must allow `capacitor://localhost` as origin
   - Also allow your Railway domain

4. **Use HTTPS:**
   - Android 9+ blocks HTTP (cleartext) by default
   - Always use `https://` in your backend URL

### Build errors

- **Gradle sync failed:** Open `android/` in Android Studio, let it sync Gradle
- **Java version:** Ensure Java 11 or 17 is installed and JAVA_HOME is set
- **Missing dependencies:** Run `npm install` in project root

### Environment variable not working

Next.js reads `.env.local` automatically during `npm run build`. The `NEXT_PUBLIC_*` variables are baked into the static bundle.

To verify it's included:
```bash
# After building, search for your URL in the output
grep -r "your-railway-url" out/_next/ || echo "URL not found - rebuild with correct .env.local"
```

## Testing Separate Mic/Speaker Devices

1. Connect Bluetooth headset to your Android device
2. Open the app
3. Go to Home section
4. Check Mic dropdown - should show Bluetooth device name
5. Check Speaker dropdown - should show Bluetooth device name
6. Select different devices for mic and speaker
7. Connect and test - mic should use selected input, speaker should use selected output

## Notes

- The `.env.local` file is gitignored - it won't be committed
- Backend `.env` file is separate and only used by the Python backend
- Always rebuild APK after changing `.env.local`
- Use HTTPS URLs for production backend

