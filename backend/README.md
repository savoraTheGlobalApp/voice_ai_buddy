# Voice AI Buddy Backend

Python FastAPI backend for Voice AI Buddy. Handles ephemeral token generation for OpenAI Realtime API and provides a foundation for future hardware integration.

## Setup

1. Install Python 3.9+ if not already installed

2. Create a virtual environment:

**Windows (Command Prompt/PowerShell):**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

> **Important**: On Windows, use `python` (not `python3`). If you see "Python was not found", ensure Python is installed and added to PATH.

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file from `.env.example`:

**Windows:**
```bash
copy .env.example .env
# Or in PowerShell:
Copy-Item .env.example .env
```

**macOS/Linux:**
```bash
cp .env.example .env
```

5. Edit `.env` and add your `OPENAI_API_KEY`

## Running

Development mode (with auto-reload):
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

- `GET /health` - Health check
- `GET /api/realtime-token` - Generate ephemeral token for OpenAI Realtime API

## Future Enhancements

This backend is structured to easily add:
- Hardware control endpoints (GPIO, device management)
- Local ML models (wake-word detection, VAD)
- Parental insights and analytics
- Conversation logging and analysis
- Device management for hardware deployment

## Deployment

For production deployment, use a production ASGI server like:
- Gunicorn with Uvicorn workers
- Docker with uvicorn
- Cloud platforms (AWS, GCP, Azure)

