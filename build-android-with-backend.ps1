# PowerShell script to build Android APK with backend URL configuration
# Usage: .\build-android-with-backend.ps1 -BackendUrl "https://your-backend.railway.app"

param(
    [Parameter(Mandatory=$true)]
    [string]$BackendUrl
)

Write-Host "🚀 Building Android APK with backend URL: $BackendUrl" -ForegroundColor Cyan

# Check if .env.local exists
if (Test-Path ".env.local") {
    Write-Host "📝 Updating .env.local with backend URL..." -ForegroundColor Yellow
    # Read existing .env.local
    $envContent = Get-Content ".env.local" -Raw
    
    # Update or add NEXT_PUBLIC_BACKEND_URL
    if ($envContent -match "NEXT_PUBLIC_BACKEND_URL=") {
        $envContent = $envContent -replace "NEXT_PUBLIC_BACKEND_URL=.*", "NEXT_PUBLIC_BACKEND_URL=$BackendUrl"
    } else {
        $envContent += "`nNEXT_PUBLIC_BACKEND_URL=$BackendUrl`n"
    }
    
    Set-Content -Path ".env.local" -Value $envContent
} else {
    Write-Host "📝 Creating .env.local with backend URL..." -ForegroundColor Yellow
    "NEXT_PUBLIC_BACKEND_URL=$BackendUrl" | Out-File -FilePath ".env.local" -Encoding utf8
    Write-Host "⚠️  WARNING: .env.local created with only backend URL. Make sure to add your Firebase configuration!" -ForegroundColor Red
}

# Set environment variable for this session
$env:NEXT_PUBLIC_BACKEND_URL = $BackendUrl

Write-Host "🔨 Building Next.js app..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "🔄 Syncing with Capacitor..." -ForegroundColor Cyan
npm run android:sync

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Sync failed!" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Building Android APK..." -ForegroundColor Cyan
Set-Location android
.\gradlew.bat assembleDebug

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ APK build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

Write-Host "✅ Build complete! APK location:" -ForegroundColor Green
Write-Host "   android/app/build/outputs/apk/debug/app-debug.apk" -ForegroundColor White

