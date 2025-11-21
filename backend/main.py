"""
Voice AI Buddy Backend API
Handles ephemeral token generation for OpenAI Realtime API
Future: Hardware control, ML models, parental insights
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import os
import re
import httpx
import json
import asyncio
import base64
import time
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import websockets
from openai import AsyncOpenAI

# Import TTS libraries (lazy imports)
# This prevents import errors from crashing the server if packages aren't installed
try:
    from gtts import gTTS
    import io
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    gTTS = None

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    edge_tts = None

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    AudioSegment = None

# Deepgram TTS uses websockets directly (no SDK needed for WebSocket streaming)

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Voice AI Buddy Backend", version="1.0.0")

# Initialize OpenAI client
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# CORS configuration - allow Next.js frontend
frontend_url = os.getenv("FRONTEND_URL", "")
cors_origins = [
    "http://localhost:3000",  # Next.js dev
    "http://127.0.0.1:3000",
]
# Add production frontend URL if provided
if frontend_url:
    # Support multiple URLs (comma-separated) or single URL
    for url in frontend_url.split(","):
        url = url.strip()
        if url:
            cors_origins.append(url)

# CORS regex patterns for preview deployments
# Vercel: Matches patterns like: https://*-*-*-*.vercel.app or https://project-name.vercel.app
vercel_pattern = r"https://.*\.vercel\.app"
# Railway: Matches patterns like: https://*-*-*-*.up.railway.app
railway_pattern = r"https://.*\.railway\.app"

# Combine both patterns for preview deployments
preview_pattern = f"({vercel_pattern}|{railway_pattern})"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=preview_pattern,  # Allow all Vercel and Railway preview/production URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TokenResponse(BaseModel):
    token: str


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    model: Optional[str] = None  # Will use env var if not provided


class ChatResponse(BaseModel):
    response: str
    message: Optional[str] = None


class TTSRequest(BaseModel):
    text: str
    voice: str = "nova"
    provider: Optional[str] = None  # Optional provider override

class MemoryCandidate(BaseModel):
    text: str
    type: str
    importance: int

class MemoryExtractRequest(BaseModel):
    messages: List[Dict[str, str]]  # recent user/assistant messages; we focus on user messages
    top_k: Optional[int] = 5
    existing_memories: Optional[List[str]] = None

class MemoryExtractResponse(BaseModel):
    memories: List[MemoryCandidate]


class STTRequest(BaseModel):
    audio_data: str  # Base64 encoded audio data
    language: Optional[str] = "en"


class STTResponse(BaseModel):
    text: str
    confidence: Optional[float] = None


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "voice-ai-buddy-backend"}


@app.get("/api/realtime-token", response_model=TokenResponse)
async def get_realtime_token():
    """
    Generate ephemeral client token for OpenAI Realtime API.
    This token is used by the frontend to establish WebRTC connection.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    # Use environment variable for model selection, default to gpt-realtime-mini for cost savings
    model = os.getenv("REALTIME_MODEL", "gpt-realtime-mini")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "session": {
                        "type": "realtime",
                        "model": model,
                    },
                },
                timeout=30.0,
            )

            if not response.is_success:
                error_text = response.text
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create client secret: {error_text}"
                )

            data = response.json()
            # data.value contains the ephemeral client secret string
            return TokenResponse(token=data["value"])

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Network error while contacting OpenAI API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error: {str(e)}"
        )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat API endpoint for TTT mode using OpenAI Chat API.
    Model can be specified in request or via CHAT_MODEL environment variable.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    # Use model from request, or fall back to environment variable, or default
    model = request.model or os.getenv("CHAT_MODEL", "gpt-4o-mini")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": request.messages,
                    "temperature": 0.7,
                    "max_tokens": 500,
                },
                timeout=30.0,
            )

            if not response.is_success:
                error_text = response.text
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to get chat completion: {error_text}"
                )

            data = response.json()
            assistant_message = data["choices"][0]["message"]["content"]
            return ChatResponse(response=assistant_message, message=assistant_message)

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Network error while contacting OpenAI API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error: {str(e)}"
        )


async def _generate_gtts(text: str, lang: str = "en") -> bytes:
    """
    Generate speech using gTTS (Google Text-to-Speech) - free and reliable.
    This is the default free TTS option.
    Optimized for mobile playback using pydub for better Android compatibility.
    """
    if not GTTS_AVAILABLE or gTTS is None:
        raise Exception(
            "gtts package is not installed. "
            "Please run: pip install gtts==2.5.2 in your backend virtual environment"
        )
    
    try:
        # Create gTTS object
        tts = gTTS(text=text, lang=lang, slow=False)
        
        # Save to bytes buffer
        mp3_fp = io.BytesIO()
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        
        # If pydub is available, convert to mobile-optimized format
        if PYDUB_AVAILABLE and AudioSegment is not None:
            try:
                # Load the MP3 from gTTS
                audio = AudioSegment.from_mp3(mp3_fp)
                
                # Export with optimized settings for mobile (especially Android)
                # 44.1kHz sample rate, stereo, 128kbps bitrate for better compatibility
                output = io.BytesIO()
                audio.export(
                    output,
                    format="mp3",
                    bitrate="128k",
                    parameters=["-ar", "44100", "-ac", "2"]  # 44.1kHz, stereo
                )
                output.seek(0)
                audio_data = output.read()
                
                if not audio_data:
                    raise Exception("No audio data after pydub conversion")
                
                print("gTTS audio optimized with pydub for mobile compatibility")
                return audio_data
            except Exception as pydub_error:
                # If pydub conversion fails, fall back to raw gTTS output
                print(f"pydub conversion failed, using raw gTTS output: {str(pydub_error)[:100]}")
                mp3_fp.seek(0)
                audio_data = mp3_fp.read()
                if not audio_data:
                    raise Exception("No audio data generated from gTTS")
                return audio_data
        else:
            # Fallback to raw gTTS output if pydub is not available
            audio_data = mp3_fp.read()
            if not audio_data:
                raise Exception("No audio data generated from gTTS")
            return audio_data
    except Exception as e:
        raise Exception(f"gTTS error: {str(e)}")

@app.post("/api/memories/extract", response_model=MemoryExtractResponse)
async def extract_memories(request: MemoryExtractRequest):
    """
    Extract crisp user memories from recent conversation messages.
    Returns compact memory facts with a type and an importance score (1-10).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set on the server")

    model = os.getenv("CHAT_MODEL", "gpt-4o-mini")

    system_prompt = (
        "You are a memory extraction module. From the provided recent user messages, "
        "extract at most the requested number of crisp, compact memories about the user. "
        "Each memory must be concise (<= 80 characters), and contain NO emojis. "
        "Return JSON ONLY with an array named 'memories', where each item has: "
        "'text' (string), 'type' (one of core_identity, preferences, interests, relationships, achievements, facts), "
        "and 'importance' (integer 1-10). Use the following guidelines for importance: "
        "10 = core identity (where they live or core family facts, etc.); 8-9 = deep interests, future career preference, "
        "important relationships, major achievements, etc.; "
        "5-7 = preferences, hobbies, regular activities, etc.; 3-4 = temporary likes, recent activities, etc.;"
        " 1-2 = very specific one-time facts, etc. "
        "Avoid duplicates, names of the user, and generic statements. If nothing meaningful, return an empty list. "
        "IMPORTANT: Do not include the user's name in 'text'. Prefer a compact 'key: value' style when possible."
        "You will also receive an optional list of EXISTING MEMORIES so add only those information that is not" 
        " already being conveyed directly or indirectly through the information in the existing memories."
    )

    # Keep only the most recent messages to reduce cost (e.g., last 20)
    recent = request.messages[-20:]
    # Removed verbose debug prints

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Extract up to {request.top_k or 5} memories from these messages: {recent}. EXISTING MEMORIES (avoid repeating): {request.existing_memories or []}"},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 400,
                    "response_format": {"type": "json_object"},
                },
                timeout=30.0,
            )

            if not response.is_success:
                error_text = response.text
                raise HTTPException(status_code=500, detail=f"Failed to extract memories: {error_text}")

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            try:
                parsed = httpx.Response(200, text=content).json()
            except Exception:
                # Try Python json
                import json
                parsed = json.loads(content)
            memories = parsed.get("memories", [])
            # no-op
            # Validate / coerce
            cleaned = []
            for m in memories:
                try:
                    text = str(m.get("text", "")).strip()
                    mtype = str(m.get("type", "facts")).strip()
                    importance = int(m.get("importance", 3))
                    if not text:
                        continue
                    cleaned.append({"text": text, "type": mtype, "importance": importance})
                except Exception:
                    continue
            # no-op
            return MemoryExtractResponse(memories=cleaned[: (request.top_k or 5)])
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Network error while contacting OpenAI API: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected server error: {str(e)}")


async def _generate_edge_tts(text: str, voice: str = "en-US-AriaNeural") -> bytes:
    """
    Generate speech using Edge TTS (free but can be blocked/rate-limited by Microsoft).
    """
    if not EDGE_TTS_AVAILABLE or edge_tts is None:
        raise Exception(
            "edge-tts package is not installed. "
            "Please run: pip install edge-tts==6.1.9 in your backend virtual environment"
        )
    
    try:
        communicate = edge_tts.Communicate(text, voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        if not audio_data:
            raise Exception("No audio data generated from Edge TTS")
        
        return audio_data
    except Exception as e:
        raise Exception(f"Edge TTS error: {str(e)}")


async def _generate_openai_tts(text: str, voice: str = "nova") -> bytes:
    """
    Generate speech using OpenAI TTS API.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "tts-1",
                "input": text,
                "voice": voice,
            },
            timeout=30.0,
        )

        if not response.is_success:
            error_text = response.text
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate speech: {error_text}"
            )

        return response.content


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """
    Text-to-Speech API endpoint supporting multiple TTS providers.
    TTS provider can be configured via TTS_PROVIDER environment variable or provider in request:
    - "gtts" (default): Free gTTS (Google Text-to-Speech) - most reliable free option
    - "edge": Edge TTS (Microsoft, can be blocked/rate-limited)
    - "openai": OpenAI TTS API (requires OPENAI_API_KEY, paid)
    - "deepgram": Deepgram Aura TTS (requires DEEPGRAM_API_KEY, paid, streaming via WebSocket)
    
    Automatic fallback: If gTTS fails, tries OpenAI if API key is available.
    Note: Deepgram TTS should use WebSocket endpoint /ws/tts/deepgram for low latency streaming.
    """
    # Get TTS provider from request or environment variable, default to "gtts"
    tts_provider = getattr(request, 'provider', None) or os.getenv("TTS_PROVIDER", "gtts")
    tts_provider = tts_provider.lower()
    
    # Validate text is not empty
    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )
    
    text = request.text.strip()

    # Deepgram TTS should use WebSocket endpoint for low latency streaming
    if tts_provider == "deepgram":
        raise HTTPException(
            status_code=400,
            detail="Deepgram TTS requires WebSocket connection for low latency. Use /ws/tts/deepgram endpoint."
        )

    try:
        audio_data = None
        media_type = "audio/mpeg"
        
        if tts_provider == "openai":
            # Use OpenAI TTS directly
            audio_data = await _generate_openai_tts(text, request.voice)
        elif tts_provider == "edge":
            # Try Edge TTS
            edge_voice = os.getenv("EDGE_TTS_VOICE", "en-US-AriaNeural")
            try:
                audio_data = await _generate_edge_tts(text, edge_voice)
            except Exception as edge_error:
                # Edge TTS failed, try fallback to gTTS
                error_str = str(edge_error)
                print(f"⚠️ Edge TTS failed: {error_str[:100]}")
                if GTTS_AVAILABLE:
                    print("🔄 Falling back to gTTS...")
                    try:
                        gtts_lang = os.getenv("GTTS_LANG", "en")
                        audio_data = await _generate_gtts(text, gtts_lang)
                        print("✅ gTTS fallback succeeded")
                    except Exception as gtts_error:
                        # Try OpenAI as last resort if available
                        openai_api_key = os.getenv("OPENAI_API_KEY")
                        if openai_api_key:
                            print("🔄 Falling back to OpenAI TTS...")
                            try:
                                audio_data = await _generate_openai_tts(text, request.voice)
                                print("✅ OpenAI TTS fallback succeeded")
                            except Exception as openai_error:
                                raise HTTPException(
                                    status_code=500,
                                    detail=f"All TTS providers failed. Last error: {str(openai_error)[:200]}"
                                )
                        else:
                            raise HTTPException(
                                status_code=500,
                                detail=f"Edge TTS failed and no fallback available. Error: {error_str[:200]}"
                            )
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Edge TTS failed: {error_str[:200]}"
                    )
        else:
            # Default: Use gTTS (most reliable free option)
            gtts_lang = os.getenv("GTTS_LANG", "en")
            try:
                audio_data = await _generate_gtts(text, gtts_lang)
            except Exception as gtts_error:
                # gTTS failed, try OpenAI as fallback if available
                error_str = str(gtts_error)
                print(f"⚠️ gTTS failed: {error_str[:100]}")
                openai_api_key = os.getenv("OPENAI_API_KEY")
                if openai_api_key:
                    print("🔄 Falling back to OpenAI TTS...")
                    try:
                        audio_data = await _generate_openai_tts(text, request.voice)
                        print("✅ OpenAI TTS fallback succeeded")
                    except Exception as openai_error:
                        raise HTTPException(
                            status_code=500,
                            detail=f"gTTS failed and OpenAI fallback also failed. gTTS error: {error_str[:200]}"
                        )
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"gTTS failed: {error_str[:200]}. Set OPENAI_API_KEY for fallback."
                    )

        if not audio_data:
            raise HTTPException(
                status_code=500,
                detail="Generated audio data is empty"
            )

        return Response(
            content=audio_data,
            media_type=media_type,
            headers={
                "Content-Disposition": "inline; filename=speech.mp3",
                "Content-Length": str(len(audio_data))
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        # Log the actual error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"TTS Error Details: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"TTS generation error: {str(e)}"
        )


@app.post("/api/stt", response_model=STTResponse)
async def speech_to_text(request: STTRequest):
    """
    Speech-to-Text API endpoint using OpenAI Whisper API.
    Accepts base64 encoded audio data and returns transcribed text.
    """
    if not openai_client.api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    try:
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data)
        
        if len(audio_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail="Empty audio data received"
            )

        # Create a temporary file-like object for the audio data
        import io
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "audio.webm"  # Set a name for the file

        # Call OpenAI Whisper API
        response = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=request.language,
            response_format="verbose_json"
        )

        # Extract text and confidence if available
        text = response.text.strip()
        confidence = getattr(response, 'confidence', None)

        return STTResponse(text=text, confidence=confidence)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"STT error: {str(e)}"
        )


class STTConnectionManager:
    """Manages WebSocket connections for real-time STT"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.connection_buffers: Dict[WebSocket, bytearray] = {}
        self.connection_start_times: Dict[WebSocket, float] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_buffers[websocket] = bytearray()
        print(f"STT WebSocket connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.connection_buffers:
            del self.connection_buffers[websocket]
        if websocket in self.connection_start_times:
            del self.connection_start_times[websocket]
        print(f"STT WebSocket disconnected. Active connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            print(f"Error sending message to WebSocket: {e}")
            self.disconnect(websocket)

    async def process_audio_chunk(self, websocket: WebSocket, audio_data: bytes):
        """Process incoming audio chunk and accumulate in buffer"""
        if websocket not in self.connection_buffers:
            return

        # Track when first audio chunk arrives (start of speech)
        if websocket not in self.connection_start_times:
            self.connection_start_times[websocket] = time.time()
            print(f"[STT Backend] Started receiving audio at {time.strftime('%H:%M:%S.%f')[:-3]}")

        # Add audio data to buffer
        self.connection_buffers[websocket].extend(audio_data)
        
        # Check if we have enough data to process (e.g., 1 second of audio at 16kHz)
        # This is configurable based on your needs
        min_buffer_size = 32000  # ~1 second at 16kHz 16-bit
        
        if len(self.connection_buffers[websocket]) >= min_buffer_size:
            await self.transcribe_buffer(websocket)

    async def transcribe_buffer(self, websocket: WebSocket):
        """Transcribe accumulated audio buffer"""
        if websocket not in self.connection_buffers:
            return

        buffer_data = bytes(self.connection_buffers[websocket])
        if len(buffer_data) == 0:
            return

        try:
            # Create file-like object for OpenAI API
            import io
            audio_file = io.BytesIO(buffer_data)
            audio_file.name = "audio.webm"

            # Transcribe using OpenAI Whisper
            response = await openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="en",
                response_format="json"
            )

            text = response.text.strip()
            
            if text:  # Only send if we got meaningful text
                # Calculate and log latency
                current_time = time.time()
                if websocket in self.connection_start_times:
                    latency_ms = int((current_time - self.connection_start_times[websocket]) * 1000)
                    print(f"[STT Backend] ==========================================")
                    print(f"[STT Backend] Speech-to-Text completed in {latency_ms}ms")
                    print(f"[STT Backend] Audio started: {time.strftime('%H:%M:%S.%f', time.localtime(self.connection_start_times[websocket]))[:-3]}")
                    print(f"[STT Backend] Transcription done: {time.strftime('%H:%M:%S.%f', time.localtime(current_time))[:-3]}")
                    print(f"[STT Backend] Transcribed text: \"{text}\"")
                    print(f"[STT Backend] ==========================================")
                    
                    # Reset the start time for next recording
                    del self.connection_start_times[websocket]
                
                await self.send_personal_message({
                    "type": "transcription",
                    "text": text,
                    "timestamp": asyncio.get_event_loop().time()
                }, websocket)

            # Clear the buffer after successful transcription
            self.connection_buffers[websocket].clear()

        except Exception as e:
            print(f"Error transcribing audio: {e}")
            # Reset timing on error
            if websocket in self.connection_start_times:
                del self.connection_start_times[websocket]
            await self.send_personal_message({
                "type": "error",
                "message": f"Transcription error: {str(e)}"
            }, websocket)


# Global STT connection manager
stt_manager = STTConnectionManager()


@app.websocket("/ws/stt")
async def websocket_stt_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time Speech-to-Text using OpenAI Whisper.
    
    Expected message format:
    - For audio data: {"type": "audio", "data": "<base64-encoded-audio>"}
    - For end of speech: {"type": "end"}
    - For configuration: {"type": "config", "language": "en"}
    
    Response format:
    - Transcription: {"type": "transcription", "text": "...", "timestamp": 123456}
    - Error: {"type": "error", "message": "..."}
    """
    await stt_manager.connect(websocket)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            
            if message_type == "audio":
                # Process audio data
                audio_b64 = message.get("data", "")
                if audio_b64:
                    try:
                        audio_bytes = base64.b64decode(audio_b64)
                        await stt_manager.process_audio_chunk(websocket, audio_bytes)
                    except Exception as e:
                        await stt_manager.send_personal_message({
                            "type": "error",
                            "message": f"Invalid audio data: {str(e)}"
                        }, websocket)
            
            elif message_type == "end":
                # End of speech - transcribe whatever is in buffer
                await stt_manager.transcribe_buffer(websocket)
            
            elif message_type == "config":
                # Configuration update (language, etc.)
                await stt_manager.send_personal_message({
                    "type": "config_updated",
                    "message": "Configuration updated successfully"
                }, websocket)
            
            elif message_type == "ping":
                # Health check
                await stt_manager.send_personal_message({
                    "type": "pong",
                    "timestamp": asyncio.get_event_loop().time()
                }, websocket)
                
    except WebSocketDisconnect:
        stt_manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        stt_manager.disconnect(websocket)


# Deepgram TTS WebSocket endpoint for low-latency streaming
class TTSConnectionManager:
    """Manages WebSocket connections for Deepgram TTS streaming"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.connection_deepgram_ws: Dict[WebSocket, Any] = {}  # Store Deepgram WebSocket per client
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"TTS WebSocket connected. Active connections: {len(self.active_connections)}")
        
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.connection_deepgram_ws:
            deepgram_ws = self.connection_deepgram_ws[websocket]
            if deepgram_ws:
                try:
                    asyncio.create_task(deepgram_ws.close())
                except:
                    pass
            del self.connection_deepgram_ws[websocket]
        print(f"TTS WebSocket disconnected. Active connections: {len(self.active_connections)}")
        
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            print(f"Error sending message to WebSocket: {e}")
            self.disconnect(websocket)


# Global TTS connection manager
tts_manager = TTSConnectionManager()


@app.websocket("/ws/tts/deepgram")
async def websocket_tts_deepgram_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time Deepgram TTS streaming (low latency).
    
    Expected message format:
    - For text to speak: {"type": "speak", "text": "..."}
    - For flush: {"type": "flush"}
    - For close: {"type": "close"}
    
    Response format:
    - Audio chunk: binary PCM data (linear16, 48kHz)
    - Control: {"type": "playback_finished"} or {"type": "error", "message": "..."}
    """
    await tts_manager.connect(websocket)
    
    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")
    if not deepgram_api_key:
        await tts_manager.send_personal_message({
            "type": "error",
            "message": "DEEPGRAM_API_KEY is not set on the server"
        }, websocket)
        tts_manager.disconnect(websocket)
        return
    
    # Deepgram TTS model (Aura-2 for low latency)
    tts_model = os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-thalia-en")
    sample_rate = 48000  # 48kHz for optimal quality and latency
    
    try:
        # Connect to Deepgram TTS WebSocket
        deepgram_url = (
            f"wss://api.deepgram.com/v1/speak?"
            f"model={tts_model}&encoding=linear16&sample_rate={sample_rate}"
        )
        
        async with websockets.connect(
            deepgram_url,
            extra_headers={"Authorization": f"Token {deepgram_api_key}"}
        ) as deepgram_ws:
            print("🟢 Deepgram TTS WebSocket connected")
            tts_manager.connection_deepgram_ws[websocket] = deepgram_ws
            
            # Task to forward audio from Deepgram to client
            async def forward_audio():
                try:
                    async for message in deepgram_ws:
                        if isinstance(message, bytes):
                            # Audio data - send directly to client as binary
                            try:
                                await websocket.send_bytes(message)
                            except Exception as e:
                                print(f"Error sending audio to client: {e}")
                                break
                        elif isinstance(message, str):
                            # Control message
                            try:
                                data = json.loads(message)
                                if data.get("type") == "PlaybackFinished":
                                    await tts_manager.send_personal_message({
                                        "type": "playback_finished"
                                    }, websocket)
                                elif data.get("type") == "Error":
                                    await tts_manager.send_personal_message({
                                        "type": "error",
                                        "message": data.get("message", "Deepgram TTS error")
                                    }, websocket)
                            except json.JSONDecodeError:
                                pass
                except Exception as e:
                    print(f"Error forwarding audio: {e}")
                    await tts_manager.send_personal_message({
                        "type": "error",
                        "message": f"Audio forwarding error: {str(e)}"
                    }, websocket)
            
            # Start audio forwarding task
            forward_task = asyncio.create_task(forward_audio())
            
            # Handle messages from client
            try:
                while True:
                    data = await websocket.receive_text()
                    message = json.loads(data)
                    
                    message_type = message.get("type")
                    
                    if message_type == "speak":
                        # Send text to Deepgram for synthesis
                        text = message.get("text", "").strip()
                        if text:
                            speak_msg = json.dumps({
                                "type": "Speak",
                                "text": text
                            })
                            await deepgram_ws.send(speak_msg)
                            print(f"📢 Sent text to Deepgram TTS: {text[:50]}...")
                    
                    elif message_type == "flush":
                        # Flush Deepgram buffer
                        flush_msg = json.dumps({"type": "Flush"})
                        await deepgram_ws.send(flush_msg)
                        print("🔄 Flushed Deepgram TTS buffer")
                    
                    elif message_type == "close":
                        # Close connection
                        break
                    
                    elif message_type == "ping":
                        # Health check
                        await tts_manager.send_personal_message({
                            "type": "pong",
                            "timestamp": asyncio.get_event_loop().time()
                        }, websocket)
            
            except WebSocketDisconnect:
                print("Client disconnected from Deepgram TTS WebSocket")
            finally:
                forward_task.cancel()
                try:
                    await forward_task
                except asyncio.CancelledError:
                    pass
                
    except Exception as e:
        print(f"Deepgram TTS WebSocket error: {e}")
        await tts_manager.send_personal_message({
            "type": "error",
            "message": f"Deepgram TTS connection error: {str(e)}"
        }, websocket)
    finally:
        tts_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )

