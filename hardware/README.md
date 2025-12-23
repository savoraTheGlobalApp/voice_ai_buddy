# Raspberry Pi Voice AI Buddy Client

Screen-free voice AI interaction client for Raspberry Pi hardware.

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Architecture](#component-architecture)
4. [End-to-End Flow](#end-to-end-flow)
5. [Over-the-Air (OTA) Configuration](#over-the-air-ota-configuration)
6. [Backend API Integration](#backend-api-integration)
7. [Installation & Setup](#installation--setup)
8. [Configuration](#configuration)
9. [Usage](#usage)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This is a modular Python client that runs on Raspberry Pi 4 Model B (or compatible) to provide voice AI interaction for children. It connects to the Railway backend API and handles:

- **STT (Speech-to-Text)**: Streaming via WebSocket (Google Cloud STT or Deepgram)
- **TTT (Text-to-Text)**: Non-streaming HTTP POST (OpenAI GPT-4o-mini)
- **TTS (Text-to-Speech)**: Non-streaming HTTP POST (gTTS, OpenAI TTS, Edge TTS, or Deepgram)

### Key Design Principles

1. **Thin Client Architecture**: RPi client is lightweight, all heavy processing happens on the backend
2. **No Direct Firebase Access**: All Firebase operations (memories, conversations) are proxied through the backend for security
3. **OTA Configuration**: Company-controlled settings (STT/TTS providers, models, limits) are fetched from backend on startup
4. **Modular Design**: Clear separation of concerns with dedicated modules for audio, API, config, etc.
5. **Separation from Web Frontend**: RPi client uses separate backend endpoints to avoid breaking the standalone web application

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Raspberry Pi Client                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Audio Handler│  │ API Client   │  │   Config     │          │
│  │ (PyAudio)    │  │ (HTTP/WS)    │  │ (Local+OTA)  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         │                  │                  │                  │
│  ┌──────▼──────────────────▼──────────────────▼──────┐          │
│  │              Main Orchestrator                     │          │
│  │  (STT → TTT → TTS pipeline, Memory extraction)    │          │
│  └───────────────────────────────────────────────────┘          │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             │ HTTPS / WSS
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                    Railway Backend (FastAPI)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ STT WebSocket│  │ Chat API     │  │ TTS API      │          │
│  │ Proxy        │  │ (OpenAI)     │  │ (gTTS/etc)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Memory       │  │ Conversation │  │ Hardware     │          │
│  │ Service      │  │ Service      │  │ Config API   │          │
│  │ (Firebase)   │  │ (Firebase)   │  │ (OTA)        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────┬───────────────────────────────────┘
                               │
                               │ Firebase Admin SDK
                               │
                    ┌──────────▼──────────┐
                    │   Firebase/Firestore │
                    │   (User Data Store)  │
                    └─────────────────────┘
```

### Data Flow

1. **Audio Input**: Microphone → PyAudio → Audio Handler → Resample to 16kHz → STT WebSocket
2. **STT Processing**: Audio chunks → Backend WebSocket → Google Cloud/Deepgram → Transcripts → RPi Client
3. **TTT Processing**: Transcript → Backend `/api/chat` → OpenAI → Response text → RPi Client
4. **TTS Processing**: Response text → Backend `/api/tts` → gTTS/OpenAI/etc → MP3 audio → RPi Client
5. **Memory Management**: Conversation → Backend `/api/memories/extract` → Backend `/api/users/{uid}/memories` → Firebase
6. **Conversation Logging**: Messages → Backend `/api/users/{uid}/conversations/{session_id}/append` → Firebase

---

## Component Architecture

### File Structure

```
hardware/rpi_client/
├── __init__.py              # Package initialization
├── main.py                  # Main orchestrator (VoiceAIBuddy class)
├── config.py                # Configuration management (local + OTA)
├── audio_handler.py         # PyAudio wrapper (mic/speaker I/O)
├── api_client.py            # Backend API communication (HTTP + WebSocket)
└── instruction_builder.py   # System prompt generation (ports App.tsx logic)
```

### Component Responsibilities

#### 1. `main.py` - Main Orchestrator

**Class**: `VoiceAIBuddy`

**Responsibilities**:
- Initialize all components (audio, API client, config)
- Orchestrate STT → TTT → TTS pipeline
- Manage conversation history
- Extract and save memories periodically
- Save conversation chunks to Firebase via backend

**Key Methods**:
- `initialize()`: Sets up audio handler, fetches remote config, loads memories, builds instructions, starts conversation session
- `run()`: Main loop that connects to STT WebSocket and streams audio
- `_on_transcript()`: Callback when STT returns a transcript - triggers TTT, TTS, memory extraction, conversation saving
- `_extract_and_save_memories()`: Extracts memories from conversation via backend API
- `_save_conversation_chunk()`: Saves conversation messages to Firebase via backend API

#### 2. `config.py` - Configuration Management

**Class**: `Config`

**Responsibilities**:
- Load local environment variables (user/hardware-specific)
- Fetch remote configuration from backend (company-controlled, OTA-updatable)
- Provide async getters for remote config values
- Validate configuration

**Local Config (from `.env`)**:
- `BACKEND_URL`: Backend API URL
- `USER_UID`: Firebase user ID
- `USER_NAME`: Child's name
- `USER_AGE`: Child's age
- `AUDIO_INPUT_DEVICE`: Microphone device index
- `AUDIO_OUTPUT_DEVICE`: Speaker device index
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

**Remote Config (from `/api/config/hardware`)**:
- `stt_provider`: STT provider (googlecloud, deepgram)
- `tts_provider`: TTS provider (gtts, openai, edge, deepgram)
- `chat_model`: Chat model (gpt-4o-mini, etc.)
- `top_memories_count`: Number of top memories to fetch
- `memory_limit`: Maximum memories per user
- `sample_rate`: Audio sample rate (Hz)
- `chunk_size`: Audio buffer size (frames)

**Key Methods**:
- `fetch_remote_config()`: Fetches OTA config from backend on startup
- `get_stt_provider()`, `get_tts_provider()`, `get_chat_model()`, etc.: Async getters for remote values
- `validate()`: Validates local config
- `validate_remote_config()`: Validates fetched remote config


#### 3. `audio_handler.py` - Audio I/O

**Class**: `AudioHandler`

**Responsibilities**:
- Capture audio from microphone using PyAudio
- Play audio through speaker (MP3, WAV, raw PCM)
- Detect supported sample rates for audio devices
- Resample audio to 16kHz for STT services

**Key Methods**:
- `start_recording()`: Starts recording from microphone, yields audio chunks
- `play_audio()`: Plays audio data (MP3, WAV, raw PCM)
- `_get_device_supported_rate()`: Detects best supported sample rate for device
- `resample_audio_to_16khz()`: Converts audio from device rate to 16kHz


#### 4. `api_client.py` - Backend Communication

**Class**: `APIClient`

**Responsibilities**:
- Connect to STT WebSocket (Google Cloud or Deepgram)
- Send audio chunks to STT WebSocket
- Receive transcripts from STT WebSocket
- Send chat requests to backend (`/api/chat`)
- Send TTS requests to backend (`/api/tts`)
- Fetch hardware configuration (`/api/config/hardware`)
- Manage memories via backend (`/api/users/{uid}/memories/*`)
- Manage conversations via backend (`/api/users/{uid}/conversations/*`)

**Key Methods**:
- `connect_stt()`: Connects to STT WebSocket and sets up transcript receiver
- `send_audio_chunk()`: Sends audio data to STT WebSocket
- `chat()`: Sends chat request and gets response
- `tts()`: Sends TTS request and gets MP3 audio
- `get_hardware_config()`: Fetches OTA configuration
- `get_top_memories()`: Fetches user memories from backend
- `save_memories()`: Saves memories via backend
- `extract_memories()`: Extracts memories from conversation via backend
- `start_conversation_session()`: Starts conversation session via backend
- `append_conversation_chunk()`: Appends messages to conversation via backend


#### 5. `instruction_builder.py` - System Prompt Generation

**Functions**:
- `build_socratic_tutor_instructions()`: Builds personalized system prompt with user info and memories
- `crispify_memory_text()`: Cleans memory text by removing user name and connectors



---

## End-to-End Flow

### 1. Application Startup (`main.py` → `main()`)

```
1. Create VoiceAIBuddy instance
2. Call initialize()
   ├─ Validate local config (config.validate())
   ├─ Create APIClient instance
   ├─ Fetch remote config from backend (config.fetch_remote_config())
   │  └─ GET /api/config/hardware
   ├─ Initialize AudioHandler with remote sample_rate and chunk_size
   ├─ Fetch user memories from backend
   │  └─ GET /api/users/{uid}/memories/top?limit={top_memories_count}
   ├─ Build system instructions with user info and memories
   ├─ Initialize conversation history with system message
   └─ Start conversation session
      └─ POST /api/users/{uid}/conversations/start
3. Call run()
   └─ Connect to STT WebSocket and start audio streaming
```


### 2. Audio Capture & STT Flow

```
AudioHandler.start_recording()
  └─ PyAudio reads microphone at device's native sample rate (e.g., 48kHz)
     └─ Yields audio chunks

Main Loop (main.py:audio_stream())
  └─ For each audio chunk:
     ├─ Resample to 16kHz if needed (resample_audio_to_16khz())
     └─ Send to STT WebSocket (api_client.send_audio_chunk())
        └─ WebSocket: wss://backend/api/stt/{provider}
           └─ Backend proxies to Google Cloud STT or Deepgram
              └─ Returns transcripts via WebSocket

STT WebSocket Receiver (api_client._connect_googlecloud_stt())
  └─ Receives JSON messages: {"type": "transcript", "text": "..."}
     └─ Calls on_transcript callback
        └─ main.py:_on_transcript()
```


### 3. TTT (Text-to-Text) Flow

```
_on_transcript() receives transcript
  └─ Add user message to conversation_history
  └─ Call api_client.chat(conversation_history)
     └─ POST /api/chat
        ├─ Request: {"messages": [...], "model": "gpt-4o-mini"}
        └─ Backend calls OpenAI API
           └─ Returns: {"response": "AI response text"}
  └─ Add assistant message to conversation_history
```

### 4. TTS (Text-to-Speech) Flow

```
_on_transcript() after getting AI response
  └─ Call api_client.tts(response_text)
     └─ POST /api/tts
        ├─ Request: {"text": "...", "voice": "nova", "provider": "gtts"}
        └─ Backend generates audio (gTTS/OpenAI/etc)
           └─ Returns: MP3 audio bytes
  └─ Call audio_handler.play_audio(audio_data, format="mp3")
     └─ Converts MP3 to PCM using pydub
        └─ Plays through PyAudio output stream
```


### 5. Memory Extraction Flow

```
Every N user messages (default: 5)
  └─ _extract_and_save_memories()
     ├─ Get recent conversation messages (last 20)
     ├─ Fetch existing memories from backend
     │  └─ GET /api/users/{uid}/memories/top?limit={memory_limit}
     ├─ Extract new memories via backend
     │  └─ POST /api/memories/extract
     │     └─ Backend uses OpenAI to extract memories
     │        └─ Returns: {"memories": [...]}
     └─ Save memories via backend
        └─ POST /api/users/{uid}/memories
           └─ Backend crispifies, deduplicates, enforces limits
              └─ Saves to Firebase
```


### 6. Conversation Logging Flow

```
After each transcript processing
  └─ _save_conversation_chunk()
     ├─ Get new messages since last save
     ├─ Convert to dict format with timestamps
     └─ POST /api/users/{uid}/conversations/{session_id}/append
        └─ Backend appends to Firebase conversation document
           ├─ Handles document size limits (splits if >800KB)
           └─ Returns: {"session_id": "...", "was_split": false}
```

---

## Over-the-Air (OTA) Configuration

### Design Rationale

Company-controlled settings (STT/TTS providers, models, memory limits, audio settings) are stored on the backend and fetched by the RPi client on startup. This allows:

1. **Remote Updates**: Change provider settings without physical access to RPi devices
2. **Consistency**: All devices use the same configuration
3. **A/B Testing**: Test different providers/models across device groups
4. **Cost Control**: Switch providers based on usage/cost

### Configuration Categories

#### Local Configuration (RPi `.env` file)
- **User-specific**: `USER_UID`, `USER_NAME`, `USER_AGE`
- **Hardware-specific**: `AUDIO_INPUT_DEVICE`, `AUDIO_OUTPUT_DEVICE`
- **Infrastructure**: `BACKEND_URL`, `LOG_LEVEL`

#### Remote Configuration (Backend environment variables)
- **STT Provider**: `STT_PROVIDER` (googlecloud, deepgram)
- **TTS Provider**: `TTS_PROVIDER` (gtts, openai, edge, deepgram)
- **Chat Model**: `CHAT_MODEL` (gpt-4o-mini, etc.)
- **Memory Settings**: `TOP_MEMORIES_COUNT`, `MEMORY_LIMIT`
- **Audio Settings**: `SAMPLE_RATE`, `CHUNK_SIZE`

### OTA Flow

```
RPi Startup
  └─ config.fetch_remote_config(api_client)
     └─ GET /api/config/hardware
        └─ Backend reads environment variables
           └─ Returns JSON:
              {
                "stt_provider": "googlecloud",
                "tts_provider": "gtts",
                "chat_model": "gpt-4o-mini",
                "top_memories_count": 10,
                "memory_limit": 100,
                "sample_rate": 16000,
                "chunk_size": 2048
              }
  └─ Config cached in config._remote_config
  └─ All components use async getters:
     └─ await config.get_stt_provider()
     └─ await config.get_tts_provider()
     └─ etc.
```


### Fallback Behavior

If remote config fetch fails, the client uses fallback defaults:
- `STT_PROVIDER`: "googlecloud"
- `TTS_PROVIDER`: "gtts"
- `CHAT_MODEL`: "gpt-4o-mini"
- `TOP_MEMORIES_COUNT`: 10
- `MEMORY_LIMIT`: 100
- `SAMPLE_RATE`: 16000
- `CHUNK_SIZE`: 2048

This ensures the client can still function even if the backend is temporarily unavailable.

---

## Backend API Integration

### Endpoints Used by RPi Client

#### Configuration
- **`GET /api/config/hardware`**: Fetch OTA configuration
  - Returns: `{stt_provider, tts_provider, chat_model, top_memories_count, memory_limit, sample_rate, chunk_size}`

#### STT (Speech-to-Text)
- **`WebSocket /api/stt/googlecloud`**: Streaming STT via Google Cloud
- **`WebSocket /api/stt/deepgram`**: Streaming STT via Deepgram
  - Protocol: Binary audio chunks sent, JSON transcripts received
  - Keepalive: Ping every 20 seconds, timeout 10 seconds

#### TTT (Text-to-Text)
- **`POST /api/chat`**: Non-streaming chat completion
  - Request: `{messages: [{role, content}], model: "gpt-4o-mini"}`
  - Response: `{response: "..."}`

#### TTS (Text-to-Speech)
- **`POST /api/tts`**: Non-streaming TTS generation
  - Request: `{text: "...", voice: "nova", provider: "gtts"}`
  - Response: MP3 audio bytes
  - Note: Deepgram TTS requires WebSocket (`/api/tts/deepgram`), but RPi client uses HTTP POST and falls back to gTTS if Deepgram is requested

#### Memories
- **`GET /api/users/{uid}/memories/top`**: Fetch top memories
  - Query params: `limit` (default: 10)
  - Response: `{memories: [{id, text, type, importance}]}`
- **`POST /api/memories/extract`**: Extract memories from conversation
  - Request: `{messages: [...], top_k: 5, existing_memories: [...]}`
  - Response: `{memories: [{text, type, importance}]}`
- **`POST /api/users/{uid}/memories`**: Save memories
  - Request: `{memories: [{text, type, importance}], user_name: "..."}`
  - Response: `{message: "...", saved_count: N}`

#### Conversations
- **`POST /api/users/{uid}/conversations/start`**: Start conversation session
  - Request: `{session_id: "...", mode: "stt"}`
  - Response: `{message: "...", session_id: "..."}`
- **`POST /api/users/{uid}/conversations/{session_id}/append`**: Append messages
  - Request: `{messages: [{role, content, ts}]}`
  - Response: `{session_id: "...", was_split: false}`

### Backend Implementation

All Firebase operations are handled by backend services:
- `backend/services/firebase_service.py`: Firebase Admin SDK initialization
- `backend/services/memory_service.py`: Memory operations (ports `lib/memories.ts`)
- `backend/services/conversation_service.py`: Conversation operations (ports `lib/conversations.ts`)

The RPi client **never** directly accesses Firebase. All operations go through the backend API.

---

## Installation & Setup

### Prerequisites

- Raspberry Pi 4 Model B (2GB+ RAM recommended, 4GB+ preferred)
- Raspberry Pi OS (Lite or Desktop)
- Python 3.9+
- USB microphone
- USB speaker or 3.5mm audio output
- Internet connection (WiFi or Ethernet)
- Railway backend deployed and accessible

### 1. Install System Dependencies

```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install audio dependencies
sudo apt install -y portaudio19-dev python3-pyaudio
sudo apt install -y ffmpeg  # For MP3 audio support

# Install Python and pip
sudo apt install -y python3 python3-pip python3-venv
```

### 2. Clone and Setup

```bash
# Navigate to hardware directory
cd hardware

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your configuration
nano .env
```

**Required configuration** (local, user/hardware-specific):
- `BACKEND_URL`: Your Railway backend URL (e.g., `https://your-app.railway.app`)
- `USER_UID`: Firebase user ID for the child
- `USER_NAME`: Child's name
- `USER_AGE`: Child's age (optional)

**Optional configuration**:
- `AUDIO_INPUT_DEVICE`: Microphone device index (auto-detected if not set)
- `AUDIO_OUTPUT_DEVICE`: Speaker device index (auto-detected if not set)
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

**Note**: Company-controlled settings (STT/TTS providers, models, etc.) are fetched from the backend on startup. They are **not** configured in the RPi's `.env` file.

### 4. Test Audio Devices

```bash
# Activate virtual environment
source venv/bin/activate

# List available audio devices
python3 -c "from rpi_client.audio_handler import AudioHandler; ah = AudioHandler(); print('\n'.join([f'{d[\"index\"]}: {d[\"name\"]} (in: {d[\"max_input_channels\"]}, out: {d[\"max_output_channels\"]})' for d in ah.list_devices()]))"
```

Note the device indices and update `.env` if needed.

---

## Configuration

### Environment Variables (RPi `.env` file)

See `.env.example` for all available options. Key variables:

**Required**:
- `BACKEND_URL`: Backend API URL
- `USER_UID`: Firebase user ID
- `USER_NAME`: Child's name

**Optional**:
- `USER_AGE`: Child's age
- `AUDIO_INPUT_DEVICE`: Microphone device index
- `AUDIO_OUTPUT_DEVICE`: Speaker device index
- `LOG_LEVEL`: Logging level (default: INFO)

### Remote Configuration (Backend environment variables)

These are set on the backend and fetched by the RPi client on startup:

- `STT_PROVIDER`: `googlecloud` (default) or `deepgram`
- `TTS_PROVIDER`: `gtts` (default), `openai`, `edge`, or `deepgram`
- `CHAT_MODEL`: `gpt-4o-mini` (default) or other OpenAI models
- `TOP_MEMORIES_COUNT`: Number of top memories to fetch (default: 10)
- `MEMORY_LIMIT`: Maximum memories per user (default: 100)
- `SAMPLE_RATE`: Audio sample rate in Hz (default: 16000)
- `CHUNK_SIZE`: Audio buffer size in frames (default: 2048)

### Audio Device Selection

If you have multiple audio devices, you can specify them in `.env`:

```bash
AUDIO_INPUT_DEVICE=1   # Microphone device index
AUDIO_OUTPUT_DEVICE=2  # Speaker device index
```

---

## Usage

### Run Manually

```bash
# Activate virtual environment
source venv/bin/activate

# Run the client
python3 -m rpi_client.main
```

### Run as Systemd Service (Recommended)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/voice-ai-buddy.service
```

Add the following (adjust paths as needed):

```ini
[Unit]
Description=Voice AI Buddy RPi Client
After=network.target sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/voice_ai_buddy/hardware
Environment="PATH=/home/pi/voice_ai_buddy/hardware/venv/bin"
ExecStart=/home/pi/voice_ai_buddy/hardware/venv/bin/python -m rpi_client.main
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable voice-ai-buddy.service
sudo systemctl start voice-ai-buddy.service

# Check status
sudo systemctl status voice-ai-buddy.service

# View logs
sudo journalctl -u voice-ai-buddy.service -f
```

---

## Troubleshooting

### Audio Issues

**No audio input detected:**
- Check microphone is connected and recognized: `arecord -l`
- Verify device permissions: `ls -l /dev/snd/`
- Try different `AUDIO_INPUT_DEVICE` index

**No audio output:**
- Check speaker is connected: `aplay -l`
- Test audio: `speaker-test -t wav -c 2`
- Verify `AUDIO_OUTPUT_DEVICE` index

**PyAudio installation fails:**
```bash
sudo apt install -y portaudio19-dev
pip install pyaudio
```

**Sample rate issues:**
- The client automatically detects supported sample rates
- If device reports 44100Hz but actually supports 48000Hz, the client will try 48000Hz first
- Audio is automatically resampled to 16kHz before sending to STT

### Network Issues

**Cannot connect to backend:**
- Verify `BACKEND_URL` is correct
- Check internet connection: `ping google.com`
- Test backend health: `curl https://your-backend.railway.app/health`

**WebSocket connection fails:**
- Ensure backend supports WebSocket (Railway does)
- Check firewall settings
- Verify backend is running
- Check backend logs for STT WebSocket errors

**Remote config fetch fails:**
- Client will use fallback defaults
- Check backend `/api/config/hardware` endpoint is accessible
- Verify backend environment variables are set correctly

### Firebase Issues

**Firebase operations fail:**
- All Firebase operations go through the backend
- Check backend logs for Firebase errors
- Verify backend has `FIREBASE_SERVICE_ACCOUNT_KEY` set
- Ensure Firebase Admin SDK has proper permissions

**Memory/conversation saving fails:**
- Check backend API endpoints are accessible
- Verify `USER_UID` is correct
- Check backend logs for detailed error messages

### Memory Issues (RPi Zero 2W or low RAM)

If running on RPi Zero 2W (512MB RAM), you may need to:

1. Reduce `CHUNK_SIZE` to 1024 (set on backend)
2. Use `SAMPLE_RATE=16000` (set on backend, default)
3. Close other applications
4. Consider using swap space

---

## Development

### Running Tests

```bash
# Activate virtual environment
source venv/bin/activate

# Run tests (when implemented)
pytest tests/
```

### Debugging

Set `LOG_LEVEL=DEBUG` in `.env` for detailed logging.

## License

iCurious AI
