# Voice AI Buddy

A real-time voice AI assistant built with Next.js (frontend) and Python FastAPI (backend). Designed for easy deployment on both software platforms (web/mobile) and future hardware integration (embedded devices, soft toys).

## Architecture

- **Frontend (Next.js)**: Handles microphone capture, WebRTC client, low-latency streaming to OpenAI Realtime API, and quick UX iteration
- **Backend (Python FastAPI)**: Manages API keys, generates ephemeral tokens, and provides foundation for future hardware control, ML models, and parental insights

## Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- OpenAI API key

## Quick Start

### 1. Backend Setup

**Windows:**
```bash
cd backend

# Create virtual environment (use 'python' not 'python3' on Windows)
python -m venv venv

# Activate virtual environment
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
copy .env.example .env
# Or in PowerShell: Copy-Item .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-key-here

# Run backend server
python main.py
```

**macOS/Linux:**
```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-key-here

# Run backend server
python main.py
```

> **Note**: If you get "Python was not found" on Windows, use `python` not `python3`. Ensure Python is installed and added to PATH.

Backend will run at `http://localhost:8000`

### 2. Frontend Setup

```bash
# From project root

# Install dependencies
npm install

# Create .env.local file
# Copy env.example to .env.local or create manually:
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" > .env.local

# Run frontend development server
npm run dev
```

Frontend will run at `http://localhost:3000`

### 4. Usage

1. Open `http://localhost:3000` in your browser
2. **First-time users**: Enter an access code (generated from the script above)
3. Sign up with your details (name, age, email, password)
4. **Returning users**: Click "Sign In" and enter your email and password
5. After authentication, select your microphone and speaker devices
6. Click "Connect Realtime"
7. Grant microphone permissions when prompted
8. Start speaking! The AI will respond in real-time

## Environment Variables

### Backend (`.env` in backend/ directory)

- `OPENAI_API_KEY` (required): Your OpenAI API key
- `REALTIME_MODEL` (optional): Model to use. Default: `gpt-realtime-mini` (cost-effective)
  - Options: `gpt-realtime`, `gpt-realtime-mini`, `gpt-4o-mini-realtime-preview`
- `PORT` (optional): Backend server port. Default: `8000`
- `ENV` (optional): Environment. Default: `development`
- `FRONTEND_URL` (optional): Frontend URL for CORS. Default: `http://localhost:3000`

### Frontend (`.env.local` in project root)

**Firebase Configuration (Required):**
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Firebase API key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Firebase Auth domain
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Firebase project ID
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Firebase storage bucket
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: Firebase messaging sender ID
- `NEXT_PUBLIC_FIREBASE_APP_ID`: Firebase app ID

**Other:**
- `NEXT_PUBLIC_BACKEND_URL` (optional): Backend API URL. Default: `http://localhost:8000`
- `NEXT_PUBLIC_USE_STT_MODE` (optional): Mode toggle. Default: `OFF`. Set to `ON` for cost-effective mode

## Cost Optimization

The project is configured to use `gpt-realtime-mini` by default for significant cost savings:
- **gpt-realtime-mini**: ~$0.60/1M input tokens, ~$2.40/1M output tokens (85% cheaper)
- **gpt-realtime**: ~$4.00/1M input tokens, ~$16.00/1M output tokens

Transcription is disabled by default to avoid additional charges.

## Project Structure

```
voice_ai_buddy/
├── app/                    # Next.js frontend
│   ├── App.tsx            # Main voice AI component
│   └── page.tsx           # Next.js page wrapper
├── android/                # Android app (Capacitor)
├── backend/               # Python FastAPI backend
│   ├── main.py           # FastAPI application
│   ├── requirements.txt  # Python dependencies
│   └── README.md         # Backend documentation
├── lib/                    # Shared utilities
│   └── nativeDevices.ts  # Native device plugin interface
└── README.md             # This file
```

## Android App

### Prerequisites
- Android Studio with Android SDK
- Java 11 or 17
- Physical Android device with USB debugging enabled

### Build APK

1. **Set backend URL** in `.env.local`:
   ```bash
   NEXT_PUBLIC_BACKEND_URL=https://your-railway-app.up.railway.app
   ```

2. **Build and install**:
   ```bash
   # Build Next.js app
   npm run build
   
   # Sync Capacitor
   npx cap sync android
   
   # Build APK
   cd android
   ./gradlew.bat assembleDebug
   cd ..
   
   # Install on device
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Or use build script**:
   ```bash
   ./build-android.sh
   ```

See **[README-ANDROID.md](./README-ANDROID.md)** for detailed Android build instructions and troubleshooting.

## Deployment

The architecture is designed for easy separate deployment of frontend and backend.

### Quick Deploy

**Frontend (Vercel/Netlify):**
- Import Git repository
- Set `NEXT_PUBLIC_BACKEND_URL` environment variable
- Deploy automatically on push

**Backend (Render/Railway):**
- Create new web service
- Set root directory to `backend`
- Add environment variables (see DEPLOYMENT.md)
- Auto-deploys on push

### Detailed Deployment Guide

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete step-by-step instructions covering:
- Vercel + Render setup
- Netlify + Render setup
- Railway + Vercel setup
- Production optimizations
- Troubleshooting
- Custom domains
- Cost estimation

### Future Hardware Deployment

The architecture is designed to easily add:
- **Hardware endpoints** in backend (`main.py`) for GPIO, device control
- **Local ML models** for wake-word detection, VAD
- **Parental insights** based on conversation analysis
- **Device management** for embedded deployment

## Development

### Running Both Services

Use two terminal windows:

**Terminal 1 (Backend):**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
python main.py
```

**Terminal 2 (Frontend):**
```bash
npm run dev
```

### API Endpoints

- `GET /health` - Backend health check
- `GET /api/realtime-token` - Generate ephemeral token for OpenAI Realtime API

## Troubleshooting

**Can't connect to backend:**
- Ensure backend is running on port 8000
- Check `NEXT_PUBLIC_BACKEND_URL` in `.env.local`
- Check browser console for CORS errors

**No audio output:**
- Check browser audio settings
- Ensure correct speaker device is selected
- Check system audio output settings

**Microphone not detected:**
- Grant browser microphone permissions
- Check OS microphone settings
- Try selecting different microphone in the UI

## Future Enhancements

- [ ] Hardware GPIO control endpoints
- [ ] Local wake-word detection
- [ ] Parental insights dashboard
- [ ] Conversation logging and analysis
- [ ] Multi-device support
- [ ] Custom voice models

## License

iCurious AI
