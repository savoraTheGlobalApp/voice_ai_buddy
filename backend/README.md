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

5. Edit `.env` and add your configuration:
   - `OPENAI_API_KEY`: Required for Realtime mode and Chat API
   - `TTS_PROVIDER`: Set to "edge" (default, free) or "openai" (requires API key)
   - `CHAT_MODEL`: Chat completion model (default: gpt-4o-mini)
   - `EDGE_TTS_VOICE`: Voice for Edge TTS (default: en-US-AriaNeural)

## Configuration

### TTS Provider Selection

The backend supports three TTS providers, configurable via `TTS_PROVIDER`:

- **gTTS** (default): Free Google Text-to-Speech - most reliable free option.
  - Set `TTS_PROVIDER=gtts`
  - No API key required
  - Configure language with `GTTS_LANG` (default: en)
  - Automatic fallback to OpenAI TTS if available and gTTS fails

- **Edge TTS**: Free Microsoft Edge TTS service (can be blocked/rate-limited).
  - Set `TTS_PROVIDER=edge`
  - Configure voice with `EDGE_TTS_VOICE` (default: en-US-AriaNeural)
  - See available voices: `python -c "import asyncio; import edge_tts; asyncio.run(edge_tts.list_voices())"`
  - Automatic fallback to gTTS or OpenAI if Edge TTS fails

- **OpenAI TTS**: Premium quality, requires API key (paid).
  - Set `TTS_PROVIDER=openai`
  - Requires `OPENAI_API_KEY` to be set
  - Uses voice parameter from request (default: nova)

### Chat Model Configuration

Configure the chat completion model via `CHAT_MODEL` environment variable:
- Default: `gpt-4o-mini`
- Options: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`, etc.

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
- `POST /api/chat` - Chat completion endpoint (model configurable via CHAT_MODEL)
- `POST /api/tts` - Text-to-speech endpoint (provider configurable via TTS_PROVIDER)

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

