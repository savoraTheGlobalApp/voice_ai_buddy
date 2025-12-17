# Raspberry Pi Voice AI Buddy Client

Screen-free voice AI interaction client for Raspberry Pi hardware.

## Overview

This is a modular Python client that runs on Raspberry Pi 4 Model B (or compatible) to provide voice AI interaction for children. It connects to the Railway backend API and handles:

- **STT (Speech-to-Text)**: Google Cloud STT or Deepgram
- **TTT (Text-to-Text)**: OpenAI GPT-4o-mini
- **TTS (Text-to-Speech)**: gTTS, OpenAI TTS, Edge TTS, or Deepgram TTS

## Prerequisites

- Raspberry Pi 4 Model B (2GB+ RAM recommended, 4GB+ preferred)
- Raspberry Pi OS (Lite or Desktop)
- Python 3.9+
- USB microphone
- USB speaker or 3.5mm audio output
- Internet connection (WiFi or Ethernet)
- Firebase service account key
- Railway backend deployed and accessible

## Installation

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

**Required configuration:**
- `BACKEND_URL`: Your Railway backend URL (e.g., `https://your-app.railway.app`)
- `FIREBASE_CREDENTIALS_PATH`: Path to Firebase service account key JSON
- `USER_UID`: Firebase user ID for the child
- `USER_NAME`: Child's name
- `USER_AGE`: Child's age

### 4. Test Audio Devices

```bash
# Activate virtual environment
source venv/bin/activate

# List available audio devices
python3 -c "from rpi_client.audio_handler import AudioHandler; ah = AudioHandler(); print('\n'.join([f'{d[\"index\"]}: {d[\"name\"]} (in: {d[\"max_input_channels\"]}, out: {d[\"max_output_channels\"]})' for d in ah.list_devices()]))"
```

Note the device indices and update `.env` if needed.

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

## Configuration

### Environment Variables

See `.env.example` for all available options. Key variables:

- **STT_PROVIDER**: `googlecloud` (default) or `deepgram`
- **TTS_PROVIDER**: `gtts` (default), `openai`, `edge`, or `deepgram`
- **CHAT_MODEL**: `gpt-4o-mini` (default) or other OpenAI models

### Audio Device Selection

If you have multiple audio devices, you can specify them in `.env`:

```bash
AUDIO_INPUT_DEVICE=1   # Microphone device index
AUDIO_OUTPUT_DEVICE=2  # Speaker device index
```

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

### Network Issues

**Cannot connect to backend:**
- Verify `BACKEND_URL` is correct
- Check internet connection: `ping google.com`
- Test backend health: `curl https://your-backend.railway.app/health`

**WebSocket connection fails:**
- Ensure backend supports WebSocket (Railway does)
- Check firewall settings
- Verify backend is running

### Firebase Issues

**Firebase credentials not found:**
- Verify `FIREBASE_CREDENTIALS_PATH` is correct
- Check file permissions: `ls -l path/to/service-account-key.json`
- Ensure JSON file is valid

### Memory Issues (RPi Zero 2W or low RAM)

If running on RPi Zero 2W (512MB RAM), you may need to:

1. Reduce `CHUNK_SIZE` to 1024
2. Use `SAMPLE_RATE=16000` (not higher)
3. Close other applications
4. Consider using swap space

## Architecture

```
rpi_client/
├── main.py              # Main orchestration
├── config.py            # Configuration management
├── audio_handler.py     # PyAudio wrapper (mic/speaker)
├── api_client.py        # Backend API communication
├── instruction_builder.py  # System prompt generation
├── memory_manager.py    # Firebase memory operations
└── conversation_manager.py  # Firebase conversation operations
```

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

