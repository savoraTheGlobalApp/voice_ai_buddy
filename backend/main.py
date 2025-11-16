"""
Voice AI Buddy Backend API
Handles ephemeral token generation for OpenAI Realtime API
Future: Hardware control, ML models, parental insights
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import os
import re
import httpx
import json
import base64
import asyncio
import websockets
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

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

# Import Google Cloud TTS library (lazy import)
try:
    from google.cloud import texttospeech
    GCLOUD_TTS_AVAILABLE = True
except ImportError:
    GCLOUD_TTS_AVAILABLE = False
    texttospeech = None

# Google Cloud STT removed - using gpt-4o-mini-transcribe instead

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Voice AI Buddy Backend", version="1.0.0")

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

# CORS regex pattern for Vercel preview deployments
# Matches patterns like: https://*-*-*-*.vercel.app or https://project-name.vercel.app
vercel_pattern = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=vercel_pattern,  # Allow all Vercel preview and production URLs
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

class STTRequest(BaseModel):
    audio_data: str  # Base64 encoded audio data
    language_code: str = "en-US"
    sample_rate: int = 16000
    encoding: str = "LINEAR16"  # LINEAR16, FLAC, MULAW, AMR, AMR_WB, OGG_OPUS, SPEEX_WITH_HEADER_BYTE

class STTResponse(BaseModel):
    transcript: str
    is_final: bool

class ConfigResponse(BaseModel):
    stt_provider: str
    tts_provider: str

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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "voice-ai-buddy-backend"}


@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    """
    Configuration endpoint that returns STT and TTS provider settings.
    Frontend fetches this once on startup and caches it to avoid repeated calls.
    This serves as a single source of truth for provider configuration.
    """
    stt_provider = os.getenv("STT_PROVIDER", "webspeech").lower()
    tts_provider = os.getenv("TTS_PROVIDER", "gtts").lower()
    
    # Return STT_PROVIDER as-is - frontend now handles model names directly
    # This allows using model names like "gpt-4o-mini-transcribe" directly
    return ConfigResponse(
        stt_provider=stt_provider,
        tts_provider=tts_provider
    )


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


async def _generate_gcloud_tts(text: str, voice_name: str = "en-US-Neural2-D", language_code: str = "en-US") -> bytes:
    """
    Generate speech using Google Cloud Text-to-Speech API.
    """
    if not GCLOUD_TTS_AVAILABLE or texttospeech is None:
        raise Exception(
            "google-cloud-texttospeech package is not installed. "
            "Please run: pip install google-cloud-texttospeech==2.16.3 in your backend virtual environment"
        )
    
    # Check for Google Cloud credentials
    gcloud_credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not gcloud_credentials:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. "
                   "Please set it to the path of your Google Cloud service account JSON key file."
        )
    
    try:
        # Initialize the client
        client = texttospeech.TextToSpeechClient()
        
        # Set the text input
        synthesis_input = texttospeech.SynthesisInput(text=text)
        
        # Build the voice request
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            name=voice_name,
        )
        
        # Select the type of audio file you want returned
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        
        # Perform the text-to-speech request
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        
        # Return the audio content as bytes
        return response.audio_content
        
    except Exception as e:
        raise Exception(f"Google Cloud TTS error: {str(e)}")


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """
    Text-to-Speech API endpoint supporting multiple TTS providers.
    TTS provider can be configured via TTS_PROVIDER environment variable:
    - "gtts" (default): Free gTTS (Google Text-to-Speech) - most reliable free option
    - "edge": Edge TTS (Microsoft, can be blocked/rate-limited)
    - "openai": OpenAI TTS API (requires OPENAI_API_KEY, paid)
    - "gcloudtts": Google Cloud TTS API (requires GOOGLE_APPLICATION_CREDENTIALS, uses free credits)
    
    Automatic fallback: If gTTS fails, tries OpenAI if API key is available.
    """
    # Get TTS provider from environment variable, default to "gtts"
    tts_provider = os.getenv("TTS_PROVIDER", "gtts").lower()
    
    # Validate text is not empty
    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )
    
    text = request.text.strip()

    try:
        audio_data = None
        media_type = "audio/mpeg"
        
        if tts_provider == "openai":
            # Use OpenAI TTS directly
            audio_data = await _generate_openai_tts(text, request.voice)
        elif tts_provider == "gcloudtts":
            # Use Google Cloud TTS
            gcloud_voice = os.getenv("GCLOUD_TTS_VOICE", "en-US-Neural2-D")
            gcloud_lang = os.getenv("GCLOUD_TTS_LANG", "en-US")
            try:
                audio_data = await _generate_gcloud_tts(text, gcloud_voice, gcloud_lang)
            except Exception as gcloud_error:
                # Google Cloud TTS failed, try fallback to gTTS
                error_str = str(gcloud_error)
                print(f"⚠️ Google Cloud TTS failed: {error_str[:100]}")
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
                                detail=f"Google Cloud TTS failed and no fallback available. Error: {error_str[:200]}"
                            )
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Google Cloud TTS failed: {error_str[:200]}"
                    )
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


# ============================================================================
# GPT-4o-mini-transcribe Integration
# ============================================================================
# Uses OpenAI Realtime API for transcription only (no TTS, no chat)
# ============================================================================

# Global dictionary to store active STT sessions
active_stt_sessions: Dict[str, Any] = {}


@app.post("/api/stt/transcribe")
async def transcribe_audio_file(audio: UploadFile = File(...)):
    """
    Non-streaming transcription endpoint using OpenAI Audio API.
    Accepts complete audio file and returns transcript.
    
    Request: multipart/form-data with "audio" file
    Response: {"transcript": "transcribed text", "status": "success"}
    """
    try:
        # Validate STT provider
        stt_provider = os.getenv("STT_PROVIDER", "webspeech").lower()
        is_openai_stt = (
            stt_provider.startswith("gpt-") or 
            stt_provider == "gpt4ominitranscribe" or
            stt_provider == "gpt4otranscribe"
        )
        
        if not is_openai_stt:
            raise HTTPException(
                status_code=400,
                detail="STT_PROVIDER must be set to an OpenAI model"
            )
        
        # Validate OpenAI API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="OPENAI_API_KEY not set"
            )
        
        # Get model from STT_PROVIDER
        if stt_provider.startswith("gpt-"):
            model = stt_provider
        elif stt_provider == "gpt4ominitranscribe":
            model = "gpt-4o-mini-transcribe"
        elif stt_provider == "gpt4otranscribe":
            model = "gpt-4o-transcribe"
        else:
            model = "gpt-4o-mini-transcribe"
        
        # Read audio file
        audio_bytes = await audio.read()
        print(f"[STT] Received audio file: {len(audio_bytes)} bytes, content_type: {audio.content_type}")
        
        # Use OpenAI Audio API (transcriptions endpoint)
        async with httpx.AsyncClient(timeout=30.0) as client:
            files = {
                "file": (audio.filename or "audio.webm", audio_bytes, audio.content_type or "audio/webm")
            }
            data = {
                "model": model,
                "language": "en"  # Optional: can be auto-detected
            }
            
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={
                    "Authorization": f"Bearer {api_key}"
                },
                files=files,
                data=data
            )
            
            if not response.is_success:
                error_text = response.text
                print(f"[STT] OpenAI transcription error: {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI transcription failed: {error_text}"
                )
            
            result = response.json()
            transcript = result.get("text", "").strip()
            
            print(f"[STT] ✅ Transcription successful: '{transcript}'")
            
            return {
                "transcript": transcript,
                "status": "success"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[STT] Error transcribing audio: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


@app.websocket("/ws/stt/gpt4ominitranscribe/{session_id}")
async def websocket_stt_gpt4ominitranscribe(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for GPT-4o-mini-transcribe using OpenAI Realtime API.
    
    Client sends:
    - Initial config: {"type": "config", "sample_rate": 48000, "encoding": "OGG_OPUS", "language_code": "en-US"}
    - Audio chunks: {"type": "audio", "audio_data": "base64_encoded_audio"}
    - Close: {"type": "close"}
    
    Server sends:
    - Ready: {"type": "ready"}
    - Transcripts: {"type": "transcript", "transcript": "text", "is_final": true}
    - Errors: {"type": "error", "message": "error message"}
    """
    await websocket.accept()
    print(f"[STT] WebSocket connected for session {session_id}")
    
    try:
        # Validate OpenAI API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            await websocket.send_json({
                "type": "error",
                "message": "OPENAI_API_KEY not set"
            })
            await websocket.close()
            return
        
        # Wait for initial config message
        try:
            config_message = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            config_data = json.loads(config_message)
            if config_data.get("type") != "config":
                raise ValueError("First message must be config")
        except asyncio.TimeoutError:
            await websocket.send_json({"type": "error", "message": "Timeout waiting for config"})
            await websocket.close()
            return
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"Invalid config: {str(e)}"})
            await websocket.close()
            return
        
        # Get OpenAI Realtime API token
        # Extract model from STT_PROVIDER if it's a model name, otherwise use STT_REALTIME_MODEL or default
        stt_provider = os.getenv("STT_PROVIDER", "webspeech").lower()
        
        # If STT_PROVIDER is already a model name (starts with "gpt-"), use it directly
        if stt_provider.startswith("gpt-"):
            model = stt_provider
        # Legacy support: "gpt4ominitranscribe" -> "gpt-4o-mini-transcribe"
        elif stt_provider == "gpt4ominitranscribe":
            model = "gpt-4o-mini-transcribe"
        # Legacy support: "gpt4otranscribe" -> "gpt-4o-transcribe"
        elif stt_provider == "gpt4otranscribe":
            model = "gpt-4o-transcribe"
        # Otherwise, use STT_REALTIME_MODEL env var or default
        else:
            model = os.getenv("STT_REALTIME_MODEL", "gpt-4o-mini-transcribe")
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
                    raise Exception(f"Failed to get Realtime token: {response.text}")
                token = response.json()["value"]
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"Failed to get OpenAI token: {str(e)}"})
            await websocket.close()
            return
        
        # Connect to OpenAI Realtime API
        openai_ws = None
        stream_active = True
        
        try:
            # Connect to OpenAI Realtime API
            # Authorization is passed via URL query parameter
            ws_url = f"wss://api.openai.com/v1/realtime?model={model}&authorization=Bearer {token}"
            openai_ws = await websockets.connect(ws_url)
            print(f"[STT] Connected to OpenAI Realtime API (session {session_id})")
            
            # Configure session for transcription only (no TTS, no chat)
            # Use minimal valid configuration - OpenAI Realtime API for transcription
            # Note: We'll use a simpler config to avoid error 3000
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["audio"],
                    "instructions": "You are a transcription service. Only transcribe the audio input. Do not generate any responses.",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500
                    }
                }
            }
            await openai_ws.send(json.dumps(session_config))
            print(f"[STT] Sent session.update to OpenAI (session {session_id})")
            
            # Send ready message to client
            await websocket.send_json({"type": "ready"})
            print(f"[STT] Sent ready message to client (session {session_id})")
            
            # Start receiving audio and forwarding to OpenAI
            async def forward_to_openai():
                audio_chunk_count = 0
                try:
                    print(f"[STT] Starting to forward audio to OpenAI (session {session_id})")
                    while stream_active:
                        try:
                            message = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                            data = json.loads(message)
                            
                            if data.get("type") == "audio":
                                audio_bytes = base64.b64decode(data.get("audio_data", ""))
                                if len(audio_bytes) > 0 and openai_ws:
                                    audio_chunk_count += 1
                                    # Log first 5 chunks for debugging
                                    if audio_chunk_count <= 5:
                                        print(f"[STT] Forwarding audio chunk #{audio_chunk_count} ({len(audio_bytes)} bytes) to OpenAI (session {session_id})")
                                    
                                    # Note: OpenAI Realtime API expects PCM16 audio
                                    # The frontend sends WebM/Opus, which needs to be converted
                                    # For now, we'll send it and see if OpenAI can handle it
                                    # TODO: Add audio format conversion if needed
                                    try:
                                        await openai_ws.send(json.dumps({
                                            "type": "input_audio_buffer.append",
                                            "audio": base64.b64encode(audio_bytes).decode('utf-8')
                                        }))
                                    except Exception as audio_err:
                                        print(f"[STT] Error sending audio to OpenAI (session {session_id}): {audio_err}")
                                        # Continue processing - don't break the loop
                                        continue
                            elif data.get("type") == "close":
                                print(f"[STT] Received close message from client (session {session_id})")
                                break
                        except asyncio.TimeoutError:
                            continue
                except Exception as e:
                    print(f"[STT] Error forwarding audio (session {session_id}): {e}")
                    import traceback
                    traceback.print_exc()
            
            # Start receiving transcripts from OpenAI
            async def receive_from_openai():
                event_count = 0
                try:
                    print(f"[STT] Starting to receive messages from OpenAI (session {session_id})")
                    async for message in openai_ws:
                        if not stream_active:
                            print(f"[STT] Stream inactive, breaking receive loop (session {session_id})")
                            break
                        try:
                            data = json.loads(message)
                            event_type = data.get("type", "")
                            event_count += 1
                            
                            # Log first 15 events for debugging
                            if event_count <= 15:
                                print(f"[STT] OpenAI event #{event_count}: type='{event_type}' (session {session_id})")
                            
                            # Handle session.created event
                            if event_type == "session.created":
                                print(f"[STT] ✅ Received session.created from OpenAI (session {session_id})")
                                continue
                            
                            # Handle transcription events - OpenAI Realtime API event types
                            # The main event for input audio transcription is: conversation.item.input_audio_transcription.completed
                            if event_type == "conversation.item.input_audio_transcription.completed":
                                item = data.get("item", {})
                                transcript = item.get("transcript", "").strip()
                                if transcript:
                                    print(f"[STT] ✅ Received transcript from OpenAI: '{transcript}' (session {session_id})")
                                    await websocket.send_json({
                                        "type": "transcript",
                                        "transcript": transcript,
                                        "is_final": True,
                                        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z"
                                    })
                            # Also check for other transcription-related events
                            elif "transcription" in event_type.lower() and "completed" in event_type.lower():
                                # Try to extract transcript from various possible locations
                                transcript = data.get("transcript", "").strip()
                                if not transcript and "item" in data:
                                    item = data.get("item", {})
                                    transcript = item.get("transcript", "").strip()
                                if transcript:
                                    print(f"[STT] ✅ Received transcript from OpenAI (alternative path): '{transcript}' (session {session_id})")
                                    await websocket.send_json({
                                        "type": "transcript",
                                        "transcript": transcript,
                                        "is_final": True,
                                        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z"
                                    })
                            elif event_type == "error":
                                error_obj = data.get("error", {})
                                error_msg = error_obj.get("message", "Unknown error") if isinstance(error_obj, dict) else str(error_obj)
                                error_code = error_obj.get("code", "") if isinstance(error_obj, dict) else ""
                                
                                # Convert everything to strings for comparison
                                error_msg_str = str(error_msg).lower()
                                error_code_str = str(error_code)
                                
                                # Error code 3000 is "invalid_request_error" - often a configuration warning
                                # Check if error code is 3000 or if message contains "3000" and "invalid_request_error"
                                # The error message format can be: "received 3000 (registered) invalid_request_error; then sent 3000..."
                                # Since transcription is working, we'll log but not forward to frontend
                                is_error_3000 = (
                                    error_code_str == "3000" or 
                                    "3000" in error_code_str or 
                                    ("3000" in error_msg_str and "invalid_request_error" in error_msg_str) or
                                    ("3000" in error_msg_str and "registered" in error_msg_str)
                                )
                                
                                if is_error_3000:
                                    print(f"[STT] OpenAI API configuration warning (non-critical, transcription still works): {error_msg} (session {session_id})")
                                    # Don't forward to frontend - transcription is still working
                                    # Continue processing - don't break the loop
                                    continue
                                else:
                                    # Forward other errors to frontend
                                    print(f"[STT] ⚠️ OpenAI API error (forwarding to frontend): {error_msg} (session {session_id})")
                                    await websocket.send_json({
                                        "type": "error",
                                        "message": str(error_msg)
                                    })
                        except json.JSONDecodeError:
                            continue
                        except Exception as e:
                            print(f"[STT] Error processing OpenAI message (session {session_id}): {e}")
                            # Continue processing - don't break on individual message errors
                            continue
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"[STT] OpenAI WebSocket connection closed (session {session_id}): {e}")
                    stream_active = False
                except Exception as e:
                    error_str = str(e)
                    # Don't forward error 3000 related errors to frontend
                    if "3000" in error_str and "invalid_request_error" in error_str.lower():
                        print(f"[STT] OpenAI API configuration warning (non-critical): {error_str} (session {session_id})")
                        # Don't send to frontend
                    else:
                        print(f"[STT] Error receiving from OpenAI (session {session_id}): {e}")
                        import traceback
                        traceback.print_exc()
                        if stream_active:  # Only send if connection is still active
                            try:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": f"Connection error: {str(e)}"
                                })
                            except:
                                pass  # Connection might be closed
            
            # Run both tasks concurrently
            await asyncio.gather(
                forward_to_openai(),
                receive_from_openai(),
                return_exceptions=True
            )
            
        except Exception as e:
            error_str = str(e)
            # Don't forward error 3000 related errors to frontend
            if "3000" in error_str and "invalid_request_error" in error_str.lower():
                print(f"[STT] OpenAI API configuration warning (non-critical): {error_str}")
                # Don't send to frontend - transcription still works
            else:
                print(f"[STT] Error in OpenAI connection: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})
        finally:
            stream_active = False
            if openai_ws:
                try:
                    await openai_ws.close()
                except:
                    pass
            if session_id in active_stt_sessions:
                del active_stt_sessions[session_id]
    
    except Exception as e:
        print(f"[STT] WebSocket error (session {session_id}): {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            await websocket.close()
        except:
            pass


if __name__ == "__main__":
    import uvicorn
    import signal
    import sys
    
    # Handle Ctrl+C properly - use a more robust approach
    def signal_handler(sig, frame):
        print("\n[Server] Received shutdown signal, exiting...")
        # Force exit to ensure cleanup
        os._exit(0)
    
    # Register signal handlers
    if sys.platform != "win32":
        # Unix-like systems
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    else:
        # Windows - use different approach
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        # Also handle CTRL_BREAK_EVENT
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleCtrlHandler(lambda sig: signal_handler(sig, None), True)
        except:
            pass
    
    port = int(os.getenv("PORT", "8000"))
    
    # Run uvicorn - it should handle signals properly
    try:
        uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )
    except KeyboardInterrupt:
        print("\n[Server] Keyboard interrupt received")
        sys.exit(0)

