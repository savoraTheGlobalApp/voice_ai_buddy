"""
Voice AI Buddy Backend API
Handles ephemeral token generation for OpenAI Realtime API
Future: Hardware control, ML models, parental insights
"""
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
import os
import re
import httpx
import json
import asyncio
import time
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Import Google Cloud Speech (lazy import)
try:
    from google.cloud import speech
    GOOGLE_CLOUD_SPEECH_AVAILABLE = True
except ImportError:
    GOOGLE_CLOUD_SPEECH_AVAILABLE = False
    speech = None

# Load environment variables from .env file
load_dotenv()

# Deepgram STT endpointing configuration (silence duration in milliseconds before finalizing transcript)
# Lower values = faster response but may split sentences on natural pauses
# Higher values = more natural but slightly higher latency
# Recommended: 1200ms (1.2 seconds) for real-time conversation
DEEPGRAM_STT_ENDPOINTING_MS = 100

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from middleware.rate_limit import limiter, track_usage, get_usage_summary, get_limit_for

app = FastAPI(title="Voice AI Buddy Backend", version="1.0.0")

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    provider: Optional[str] = None  # Optional provider override from admin settings

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


# New request/response models for hardware client endpoints
class MemorySaveRequest(BaseModel):
    memories: List[MemoryCandidate]
    user_name: Optional[str] = None

class ConversationStartRequest(BaseModel):
    session_id: str
    mode: str = "stt"  # "realtime" or "stt"

class ConversationAppendRequest(BaseModel):
    messages: List[Dict[str, Any]]  # [{"role": "user|assistant|system", "content": "...", "ts": optional float}]

class ConversationAppendResponse(BaseModel):
    session_id: str
    was_split: bool


# Story generation request/response models
class StoryGenerateRequest(BaseModel):
    topics: List[str]                    # e.g., ["dinosaurs", "space"]
    values: List[str]                    # e.g., ["sharing", "kindness"]
    length: str = "medium"               # "short" | "medium" | "long"
    setting: Optional[str] = None        # e.g., "forest", "underwater"


class StorySegmentResponse(BaseModel):
    segment_index: int
    narrative: str
    segment_type: str                    # "opening" | "middle" | "climax" | "resolution"
    discussion_question: Optional[str] = None


class StoryGenerateResponse(BaseModel):
    session_id: str
    title: str
    segments: List[StorySegmentResponse]


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "voice-ai-buddy-backend"}


def _get_stt_provider() -> str:
    """
    Helper function to get STT provider from environment variable.
    Used by both get_stt_provider and get_config endpoints to avoid duplication.
    """
    return os.getenv("STT_PROVIDER", "webspeech").lower()


@app.get("/api/stt-provider")
async def get_stt_provider():
    """
    Get the configured STT provider.
    This allows frontend to use the same STT provider as configured in backend.
    For comprehensive config including STT, TTS, and Chat model, use /api/config instead.
    """
    stt_provider = _get_stt_provider()
    return {"stt_provider": stt_provider}


@app.get("/api/config")
async def get_config():
    """
    Get all backend configuration for admin settings (web frontend).
    Returns STT provider, TTS provider, and Chat model.
    Note: Mode selection (realtime vs STT-TTT-TTS) is handled by frontend via NEXT_PUBLIC_USE_STT_MODE.
    """
    stt_provider = _get_stt_provider()
    tts_provider = os.getenv("TTS_PROVIDER", "gtts").lower()
    chat_model = os.getenv("CHAT_MODEL", "gpt-4o-mini")
    
    # Check if Deepgram TTS is available (requires DEEPGRAM_API_KEY)
    deepgram_tts_available = bool(os.getenv("DEEPGRAM_API_KEY"))
    
    # Check if Google Cloud STT is available (requires GOOGLE_APPLICATION_CREDENTIALS or service account key)
    google_cloud_stt_available = False
    if GOOGLE_CLOUD_SPEECH_AVAILABLE:
        # Check for credentials via environment variable or service account key file
        google_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        service_account_key = os.getenv("GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
        google_cloud_stt_available = bool(google_creds or service_account_key)
    
    return {
        "stt_provider": stt_provider,
        "tts_provider": tts_provider,
        "chat_model": chat_model,
        "deepgram_tts_available": deepgram_tts_available,
        "google_cloud_stt_available": google_cloud_stt_available,
    }


@app.get("/api/config/hardware")
async def get_hardware_config():
    """
    Get hardware/RPi-specific configuration (OTA-updatable).
    Returns company-controlled settings that can be updated remotely.
    This endpoint is separate from /api/config to avoid breaking web frontend.
    
    Uses RPI_STT_PROVIDER and RPI_TTS_PROVIDER if set, otherwise falls back to
    STT_PROVIDER and TTS_PROVIDER (for backward compatibility).
    """
    # STT/TTS/Chat configuration (company-controlled)
    # Check RPI-specific vars first, then fall back to regular vars
    rpi_stt_provider = os.getenv("RPI_STT_PROVIDER")
    if rpi_stt_provider:
        stt_provider = rpi_stt_provider.lower()
    else:
        stt_provider = _get_stt_provider()
    
    # For hardware, map webspeech to googlecloud (hardware doesn't use browser APIs)
    if stt_provider == "webspeech":
        stt_provider = "googlecloud"  # Default for hardware
    
    # Check RPI-specific TTS provider first, then fall back to regular TTS provider
    rpi_tts_provider = os.getenv("RPI_TTS_PROVIDER")
    if rpi_tts_provider:
        tts_provider = rpi_tts_provider.lower()
    else:
        tts_provider = os.getenv("TTS_PROVIDER", "gtts").lower()
    
    chat_model = os.getenv("CHAT_MODEL", "gpt-4o-mini")
    
    # Memory configuration (company-controlled)
    top_memories_count = int(os.getenv("TOP_MEMORIES_COUNT", "10"))
    memory_limit = int(os.getenv("MEMORY_LIMIT", "100"))
    
    # Audio configuration (company-controlled for consistency)
    sample_rate = int(os.getenv("SAMPLE_RATE", "16000"))
    chunk_size = int(os.getenv("CHUNK_SIZE", "2048"))
    
    return {
        "stt_provider": stt_provider,
        "tts_provider": tts_provider,
        "chat_model": chat_model,
        "top_memories_count": top_memories_count,
        "memory_limit": memory_limit,
        "sample_rate": sample_rate,
        "chunk_size": chunk_size,
    }


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


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat API endpoint for low-latency TTS (e.g., Deepgram TTS).
    Streams chat completions as Server-Sent Events (SSE).
    Only use this when TTS provider supports streaming (e.g., Deepgram).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    # Use model from request, or fall back to environment variable, or default
    model = request.model or os.getenv("CHAT_MODEL", "gpt-4o-mini")

    async def generate():
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    'POST',
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
                        "stream": True,  # Enable streaming
                    },
                    timeout=30.0,
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {json.dumps({'error': f'OpenAI API error: {error_text.decode()}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        
                        # OpenAI SSE format: "data: {...}"
                        if line.startswith("data: "):
                            data_str = line[6:]  # Remove "data: " prefix
                            
                            # Check for [DONE] marker
                            if data_str.strip() == "[DONE]":
                                yield f"data: {json.dumps({'done': True})}\n\n"
                                break
                            
                            try:
                                data = json.loads(data_str)
                                choices = data.get("choices", [])
                                if choices and len(choices) > 0:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    
                                    if content:
                                        # Send text chunk
                                        yield f"data: {json.dumps({'delta': content, 'done': False})}\n\n"
                                    
                                    # Check if this is the final chunk
                                    finish_reason = choices[0].get("finish_reason")
                                    if finish_reason:
                                        yield f"data: {json.dumps({'delta': '', 'done': True})}\n\n"
                                        break
                            except json.JSONDecodeError:
                                # Skip invalid JSON lines
                                continue

        except httpx.HTTPError as e:
            yield f"data: {json.dumps({'error': f'Network error: {str(e)}'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Server error: {str(e)}'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
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

# Import services (lazy import to avoid errors if Firebase not configured)
try:
    from services.firebase_service import is_firebase_available, get_db
    from services.memory_service import (
        fetch_top_memories as _fetch_top_memories,
        add_memories_with_limit as _add_memories_with_limit,
        MemoryCandidate as ServiceMemoryCandidate
    )
    from services.conversation_service import (
        start_conversation_session as _start_conversation_session,
        append_conversation_chunk as _append_conversation_chunk,
        ConversationMessage as ServiceConversationMessage
    )
    from services.story_service import (
        build_story_system_prompt,
        get_story_user_prompt,
        StoryRequest as ServiceStoryRequest,
        ChildProfile,
        LENGTH_TO_SEGMENTS,
        StorySegment as ServiceStorySegment,
        save_story_session as _save_story_session,
        fetch_story_session as _fetch_story_session,
        list_story_sessions as _list_story_sessions,
        update_story_status as _update_story_status,
    )
    FIREBASE_SERVICES_AVAILABLE = True
except ImportError as e:
    FIREBASE_SERVICES_AVAILABLE = False
    logger.warning(f"Firebase services not available: {e}")

# Auth middleware
from middleware.auth import get_current_user, require_user_match


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
    TTS provider can be configured via TTS_PROVIDER environment variable:
    - "gtts" (default): Free gTTS (Google Text-to-Speech) - most reliable free option
    - "edge": Edge TTS (Microsoft, can be blocked/rate-limited)
    - "openai": OpenAI TTS API (requires OPENAI_API_KEY, paid)
    - "deepgram": Deepgram Aura-2 streaming TTS (requires DEEPGRAM_API_KEY, paid, low latency)
    - "webspeech": Web Speech API (browser-native, handled client-side only)
    
    Note: "webspeech" and "deepgram" are handled via WebSocket and should not reach this endpoint.
    Automatic fallback: If gTTS fails, tries OpenAI if API key is available.
    """
    # Get TTS provider from request (admin settings) or environment variable, default to "gtts"
    tts_provider = request.provider.lower() if request.provider else os.getenv("TTS_PROVIDER", "gtts").lower()
    
    # If webspeech is requested, this shouldn't reach the backend (handled client-side)
    # But we'll handle it gracefully just in case
    if tts_provider == "webspeech":
        raise HTTPException(
            status_code=400,
            detail="Web Speech API is browser-native and must be handled client-side. This request should not reach the backend."
        )
    
    # Deepgram TTS uses WebSocket, not HTTP POST
    if tts_provider == "deepgram":
        raise HTTPException(
            status_code=400,
            detail="Deepgram TTS uses WebSocket connection. Use /api/tts/deepgram WebSocket endpoint instead."
        )
    
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


@app.websocket("/api/stt/deepgram")
async def deepgram_stt_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for Deepgram Nova-3 streaming STT.
    Proxies audio from frontend to Deepgram and returns transcripts.
    """
    await websocket.accept()
    
    dg_api_key = os.getenv("DEEPGRAM_API_KEY")
    if not dg_api_key:
        await websocket.close(code=1008, reason="DEEPGRAM_API_KEY not configured")
        return
    
    try:
        import websockets as ws_lib
        
        # Deepgram WebSocket URL with endpointing configuration
        dg_url = (
            f"wss://api.deepgram.com/v1/listen?"
            f"model=nova-3&encoding=linear16&sample_rate=48000"
            f"&punctuate=true&interim_results=false"
            f"&endpointing={DEEPGRAM_STT_ENDPOINTING_MS}"
        )
        
        # Connect to Deepgram
        async with ws_lib.connect(
            dg_url,
            extra_headers={"Authorization": f"Token {dg_api_key}"}
        ) as dg_ws:
            print("[Deepgram STT] WebSocket connected to Deepgram")
            
            # Task to forward audio from client to Deepgram
            async def forward_audio():
                try:
                    while True:
                        audio_data = await websocket.receive_bytes()
                        await dg_ws.send(audio_data)
                except WebSocketDisconnect:
                    print("[Deepgram STT] Client disconnected")
                except Exception as e:
                    print(f"[Deepgram STT] Error forwarding audio: {e}")
            
            # Task to forward transcripts from Deepgram to client
            async def forward_transcripts():
                try:
                    async for message in dg_ws:
                        if isinstance(message, str):
                            data = json.loads(message)
                            # Extract final transcript
                            if data.get("is_final"):
                                channel = data.get("channel", {})
                                alternatives = channel.get("alternatives", [])
                                if alternatives:
                                    transcript = alternatives[0].get("transcript", "").strip()
                                    if transcript:
                                        await websocket.send_text(json.dumps({
                                            "type": "transcript",
                                            "text": transcript
                                        }))
                except Exception as e:
                    print(f"[Deepgram STT] Error forwarding transcripts: {e}")
            
            # Run both tasks concurrently
            try:
                await asyncio.gather(forward_audio(), forward_transcripts())
            except WebSocketDisconnect:
                print("[Deepgram STT] Client disconnected")
            except Exception as e:
                print(f"[Deepgram STT] Error: {e}")
                
    except ImportError:
        await websocket.close(
            code=1011,
            reason="websockets library not installed. Run: pip install websockets"
        )
    except Exception as e:
        print(f"[Deepgram STT] Connection error: {e}")
        await websocket.close(code=1011, reason=f"Server error: {str(e)}")


@app.websocket("/api/stt/googlecloud")
async def googlecloud_stt_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for Google Cloud Speech-to-Text streaming STT.
    Receives audio from frontend and streams transcripts back in real-time.
    """
    await websocket.accept()
    
    if not GOOGLE_CLOUD_SPEECH_AVAILABLE or speech is None:
        await websocket.close(
            code=1011,
            reason="google-cloud-speech library not installed. Run: pip install google-cloud-speech"
        )
        return
    
    # Check for Google Cloud credentials
    google_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    service_account_key = os.getenv("GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
    
    if not google_creds and not service_account_key:
                await websocket.close(
                    code=1008,
            reason="GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY not configured"
                )
                return
    
    try:
        # Set up Google Cloud Speech client
        # If service account key is provided as JSON string, write it to a temp file
        import tempfile
        import os as os_module
        import threading
        
        client = None
        temp_cred_file = None
        
        if service_account_key:
            # Parse JSON and write to temp file
            try:
                creds_json = json.loads(service_account_key)
                temp_cred_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
                json.dump(creds_json, temp_cred_file)
                temp_cred_file.close()
                os_module.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_cred_file.name
                client = speech.SpeechClient()
            except json.JSONDecodeError:
                await websocket.close(code=1008, reason="Invalid GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY JSON")
                return
        else:
            # Use GOOGLE_APPLICATION_CREDENTIALS path
            client = speech.SpeechClient()
        
        print("[Google Cloud STT] Client initialized")
        
        # Audio configuration
        # Google Cloud Speech expects LINEAR16 PCM at 16kHz (as per the reference code)
        RATE = 16000
        language_code = os.getenv("GOOGLE_CLOUD_STT_LANGUAGE", "en-US")
        
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=RATE,
            language_code=language_code,
            enable_automatic_punctuation=True,
        )
        
        streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=True,  # Enable interim results for real-time feedback
        )
        
        # Thread-safe queue to buffer audio chunks from WebSocket
        import queue as thread_queue
        audio_queue = thread_queue.Queue()
        recognition_active = threading.Event()
        recognition_active.set()
        
        # Task to receive audio from WebSocket and add to queue
        # Frontend sends audio continuously (including silence), so we should always receive chunks
        # Process chunks as fast as possible to prevent gaps in Google Cloud stream
        async def receive_audio():
            try:
                while recognition_active.is_set():
                    try:
                        # Wait for audio chunks from frontend (frontend sends continuously every ~128ms)
                        # Use shorter timeout to process chunks faster and reduce gaps
                        audio_data = await asyncio.wait_for(websocket.receive_bytes(), timeout=0.5)
                        # Put chunk in queue immediately (non-blocking if possible)
                        try:
                            audio_queue.put_nowait(audio_data)
                        except thread_queue.Full:
                            # Queue is full, use blocking put (shouldn't happen with continuous flow)
                            audio_queue.put(audio_data)
                    except asyncio.TimeoutError:
                        # Timeout is OK - just check if still active and continue
                        # Frontend should be sending continuously, so timeouts should be rare
                        continue
            except WebSocketDisconnect:
                print("[Google Cloud STT] Client disconnected")
                recognition_active.clear()
                try:
                    audio_queue.put_nowait(None)  # Signal end
                except thread_queue.Full:
                    audio_queue.put(None)
            except Exception as e:
                print(f"[Google Cloud STT] Error receiving audio: {e}")
                recognition_active.clear()
                try:
                    audio_queue.put_nowait(None)  # Signal end
                except thread_queue.Full:
                    audio_queue.put(None)
        
        # Generator function to yield audio chunks from queue (runs in thread)
        # CRITICAL: Never wait - always yield chunks (real audio or silence) to prevent Google Cloud timeout
        # Google Cloud requires continuous audio stream - any gap causes timeout
        def audio_generator():
            # Calculate silence chunk size: frontend sends 2048 samples at 16kHz = 4096 bytes (Int16)
            # This matches the frontend buffer size to maintain consistent chunk timing
            CHUNK_SIZE_BYTES = 2048 * 2  # 2048 samples * 2 bytes per Int16 sample = 4096 bytes
            SILENCE_CHUNK = bytes(CHUNK_SIZE_BYTES)  # Zero-filled silence chunk
            
            # Timing: Frontend sends chunks every ~128ms (2048 samples / 16000 Hz)
            # We'll yield chunks at similar rate to maintain continuous flow
            # Use slightly longer interval to reduce silence chunk frequency and allow real audio to be processed
            YIELD_INTERVAL = 0.15  # Yield every 150ms - balances continuity with allowing real audio processing
            last_yield_time = time.time()
            silence_chunk_count = 0
            real_audio_chunk_count = 0
            
            while recognition_active.is_set():
                try:
                    # Step 1: Try to get chunks from queue (non-blocking)
                    data_chunks = []
                    max_collect = 5  # Collect up to 5 chunks at a time
                    collected = 0
                    
                    while collected < max_collect:
                        try:
                            chunk = audio_queue.get_nowait()
                            if chunk is None:  # End signal
                                # Yield any collected chunks before breaking
                                if data_chunks:
                                    combined = b"".join(data_chunks)
                                    yield speech.StreamingRecognizeRequest(audio_content=combined)
                                return
                            data_chunks.append(chunk)
                            collected += 1
                        except thread_queue.Empty:
                            # Queue is empty - break and handle below
                            break
                    
                    # Step 2: If we have real audio chunks, yield them immediately
                    # Prioritize real audio over silence to ensure speech detection works
                    if data_chunks:
                        combined_audio = b"".join(data_chunks)
                        yield speech.StreamingRecognizeRequest(audio_content=combined_audio)
                        last_yield_time = time.time()
                        real_audio_chunk_count += len(data_chunks)
                        # Log every 50 real audio chunks for debugging
                        if real_audio_chunk_count % 50 == 0:
                            print(f"[Google Cloud STT] Yielded {real_audio_chunk_count} real audio chunks")
                    else:
                        # Step 3: Queue is empty - yield silence chunk to keep stream alive
                        # But only if enough time has passed to maintain rate without overwhelming Google Cloud
                        current_time = time.time()
                        time_since_last_yield = current_time - last_yield_time
                        
                        # Yield silence chunk if enough time has passed (maintains rate without flooding)
                        # This prevents Google Cloud timeout while allowing real audio to be processed
                        if time_since_last_yield >= YIELD_INTERVAL:
                            yield speech.StreamingRecognizeRequest(audio_content=SILENCE_CHUNK)
                            last_yield_time = current_time
                            silence_chunk_count += 1
                            # Log every 100 silence chunks for debugging
                            if silence_chunk_count % 100 == 0:
                                print(f"[Google Cloud STT] Yielded {silence_chunk_count} silence chunks (keeping stream alive)")
                        else:
                            # Just yielded recently - very short sleep then check queue again
                            # This prevents CPU spinning while maintaining responsiveness for real audio
                            time.sleep(0.005)  # 5ms sleep
                except Exception as e:
                    print(f"[Google Cloud STT] Error in audio generator: {e}")
                    break
        
        # Task to process recognition responses
        # CRITICAL: Process responses as they arrive (streaming), not after recognition completes
        # Automatically restart sessions before 305-second limit for seamless continuous operation
        async def process_responses():
            try:
                # Google Cloud has a 305-second limit per streaming session
                # We'll restart sessions at 290 seconds (with 15-second buffer) for seamless transition
                MAX_SESSION_DURATION = 290  # seconds (restart before 305-second limit)
                session_restart_count = 0
                total_response_count = 0
                
                # Continuous session loop - automatically restarts to handle 305-second limit
                while recognition_active.is_set():
                    session_start_time = time.time()
                    session_restart_count += 1
                    print(f"[Google Cloud STT] Starting session #{session_restart_count} (will restart at {MAX_SESSION_DURATION}s)")
                    
                    # Use thread-safe queue to pass responses from executor thread to async context
                    thread_response_queue = thread_queue.Queue()
                    loop = asyncio.get_event_loop()
                    
                    def run_recognition_and_queue():
                        """Run recognition in executor thread and queue responses"""
                        try:
                            # streaming_recognize returns an iterable that yields responses as they arrive
                            # This blocks until the generator stops, connection closes, or 305-second limit
                            responses_iterable = client.streaming_recognize(streaming_config, audio_generator())
                            
                            response_count = 0
                            for response in responses_iterable:
                                response_count += 1
                                # Put response in thread-safe queue (non-blocking if possible)
                                try:
                                    thread_response_queue.put_nowait(response)
                                except thread_queue.Full:
                                    # Queue full - use blocking put (shouldn't happen with async consumption)
                                    thread_response_queue.put(response)
                                
                                # Check if recognition is still active
                                if not recognition_active.is_set():
                                    print(f"[Google Cloud STT] Recognition stopped, exiting iterator after {response_count} responses")
                                    break
                                
                                # Check if we're approaching the limit (shouldn't happen due to proactive restart)
                                elapsed = time.time() - session_start_time
                                if elapsed >= MAX_SESSION_DURATION:
                                    print(f"[Google Cloud STT] Session duration limit approaching ({elapsed:.1f}s), will restart")
                                    break
                            
                            # Signal end of responses for this session
                            try:
                                thread_response_queue.put_nowait(None)
                            except thread_queue.Full:
                                thread_response_queue.put(None)
                            
                            print(f"[Google Cloud STT] Session #{session_restart_count} iterator completed after {response_count} responses")
                            return response_count
                        except Exception as e:
                            error_str = str(e)
                            # Check if it's the duration limit error
                            if "Exceeded maximum allowed stream duration" in error_str or "OUT_OF_RANGE" in error_str:
                                print(f"[Google Cloud STT] Session #{session_restart_count} hit duration limit (expected), restarting...")
                            else:
                                print(f"[Google Cloud STT] Session #{session_restart_count} recognition error: {e}")
                                import traceback
                                traceback.print_exc()
                            # Signal error/end
                            try:
                                thread_response_queue.put_nowait(None)
                            except thread_queue.Full:
                                thread_response_queue.put(None)
                            return 0
                    
                    # Start recognition in executor (runs in background thread)
                    executor_future = loop.run_in_executor(None, run_recognition_and_queue)
                    
                    # Process responses from queue as they arrive (async)
                    session_response_count = 0
                    last_response_time = time.time()
                    
                    while recognition_active.is_set():
                        # Check if we need to restart proactively (before hitting limit)
                        elapsed = time.time() - session_start_time
                        if elapsed >= MAX_SESSION_DURATION:
                            print(f"[Google Cloud STT] Proactively restarting session #{session_restart_count} after {elapsed:.1f}s (before 305s limit)")
                            # Break to restart - audio generator continues seamlessly
                            break
                        
                        try:
                            # Get response from thread-safe queue with timeout
                            try:
                                def get_from_queue():
                                    try:
                                        return thread_response_queue.get(timeout=1.0)
                                    except thread_queue.Empty:
                                        return None  # Signal timeout
                                
                                response = await asyncio.to_thread(get_from_queue)
                                
                                # None means timeout
                                if response is None:
                                    # Check if executor completed
                                    if executor_future.done():
                                        try:
                                            executor_future.result()  # Check for errors
                                        except Exception as exec_error:
                                            error_str = str(exec_error)
                                            if "Exceeded maximum allowed stream duration" in error_str:
                                                print(f"[Google Cloud STT] Session hit duration limit, restarting seamlessly...")
                                            else:
                                                print(f"[Google Cloud STT] Executor error: {exec_error}")
                                        break
                                    # Queue timeout is OK - continue waiting
                                    continue
                            except Exception as queue_error:
                                # Error getting from queue - check if executor completed
                                if executor_future.done():
                                    try:
                                        executor_future.result()  # Check for errors
                                    except Exception as exec_error:
                                        error_str = str(exec_error)
                                        if "Exceeded maximum allowed stream duration" in error_str:
                                            print(f"[Google Cloud STT] Session hit duration limit, restarting seamlessly...")
                                        else:
                                            print(f"[Google Cloud STT] Executor error: {exec_error}")
                                    break
                                continue
                            
                            # None signals end of responses for this session
                            if response is None:
                                print(f"[Google Cloud STT] Session #{session_restart_count} ended after {session_response_count} responses")
                                # Break to restart session seamlessly
                                break
                            
                            session_response_count += 1
                            total_response_count += 1
                            last_response_time = time.time()
                            print(f"[Google Cloud STT] Session #{session_restart_count}, Response #{session_response_count} (total: {total_response_count}), has_results: {bool(response.results)}")
                            
                            if not response.results:
                                print(f"[Google Cloud STT] Response has no results, continuing...")
                                continue
                            
                            # Process the first result (most recent)
                            result = response.results[0]
                            print(f"[Google Cloud STT] Response result: is_final={result.is_final}, has_alternatives={bool(result.alternatives)}")
                            
                            if not result.alternatives:
                                print(f"[Google Cloud STT] Response has no alternatives, continuing...")
                                continue
                            
                            transcript = result.alternatives[0].transcript.strip()
                            confidence = getattr(result.alternatives[0], 'confidence', None)
                            print(f"[Google Cloud STT] Response transcript: '{transcript}' (confidence: {confidence}, is_final: {result.is_final})")
                            
                            if not transcript:
                                print(f"[Google Cloud STT] Response transcript is empty, continuing...")
                                continue
                            
                            # Send final transcripts only (not interim results)
                            # This matches Deepgram behavior - only send finalized transcripts
                            if result.is_final:
                                print(f"[Google Cloud STT] Sending final transcript to frontend: '{transcript}'")
                                try:
                                    await websocket.send_text(json.dumps({
                                        "type": "transcript",
                                        "text": transcript
                                    }))
                                    print(f"[Google Cloud STT] Final transcript sent successfully: {transcript}")
                                except Exception as send_error:
                                    print(f"[Google Cloud STT] Error sending transcript to frontend: {send_error}")
                                    import traceback
                                    traceback.print_exc()
                            else:
                                # Don't log interim results to reduce log noise
                                # Only log final transcripts
                                pass
                        except Exception as process_error:
                            print(f"[Google Cloud STT] Error processing response: {process_error}")
                            import traceback
                            traceback.print_exc()
                            # Continue processing other responses
                            continue
                    
                    # Wait for executor to complete (with timeout)
                    try:
                        await asyncio.wait_for(executor_future, timeout=2.0)
                    except asyncio.TimeoutError:
                        print(f"[Google Cloud STT] Executor still running, continuing to next session...")
                    
                    session_duration = time.time() - session_start_time
                    print(f"[Google Cloud STT] Session #{session_restart_count} completed: {session_response_count} responses in {session_duration:.1f}s")
                    
                    # If recognition is still active, seamlessly restart (audio generator continues)
                    if recognition_active.is_set():
                        print(f"[Google Cloud STT] Seamlessly restarting session (user won't notice)...")
                        # Small delay to ensure clean transition
                        await asyncio.sleep(0.1)
                    else:
                        print(f"[Google Cloud STT] Recognition stopped, exiting session loop")
                        break
                
                print(f"[Google Cloud STT] Exited session loop after {session_restart_count} sessions, {total_response_count} total responses")
                print(f"[Google Cloud STT] Recognition active: {recognition_active.is_set()}")
                        
            except WebSocketDisconnect:
                print("[Google Cloud STT] Client disconnected during recognition")
            except Exception as e:
                print(f"[Google Cloud STT] Error processing responses: {e}")
                import traceback
                traceback.print_exc()
                recognition_active.clear()
        
        # Run both tasks concurrently
        try:
            await asyncio.gather(receive_audio(), process_responses())
        except Exception as e:
            print(f"[Google Cloud STT] Error: {e}")
        finally:
            recognition_active.clear()
            # Clean up temp file if created
            if temp_cred_file and os_module.path.exists(temp_cred_file.name):
                try:
                    os_module.unlink(temp_cred_file.name)
                except Exception:
                    pass
                    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Google Cloud STT] Connection error: {error_details}")
        await websocket.close(code=1011, reason=f"Server error: {str(e)}")


@app.websocket("/api/tts/deepgram")
async def deepgram_tts_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for Deepgram Aura-2 streaming TTS.
    Receives text from frontend, sends to Deepgram, and streams PCM audio back.
    Optimized for low latency real-time conversation.
    """
    await websocket.accept()
    
    dg_api_key = os.getenv("DEEPGRAM_API_KEY")
    if not dg_api_key:
        await websocket.close(code=1008, reason="DEEPGRAM_API_KEY not configured")
        return
    
    try:
        import websockets as ws_lib
        
        # Get Deepgram TTS model from env (default: aura-2-thalia-en)
        tts_model = os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-thalia-en")
        sample_rate = int(os.getenv("DEEPGRAM_TTS_SAMPLE_RATE", "48000"))
        
        # Deepgram TTS WebSocket URL
        dg_url = (
            f"wss://api.deepgram.com/v1/speak?"
            f"model={tts_model}&encoding=linear16&sample_rate={sample_rate}"
        )
        
        # Connect to Deepgram TTS
        async with ws_lib.connect(
            dg_url,
            extra_headers={"Authorization": f"Token {dg_api_key}"}
        ) as dg_ws:
            print(f"[Deepgram TTS] WebSocket connected to Deepgram (model: {tts_model})")
            
            # Task to forward text messages from client to Deepgram
            async def forward_text():
                try:
                    while True:
                        # Receive text message from frontend
                        message = await websocket.receive_text()
                        try:
                            data = json.loads(message)
                            msg_type = data.get("type")
                            
                            if msg_type == "speak":
                                # Send Speak message to Deepgram
                                text = data.get("text", "")
                                if text:
                                    await dg_ws.send(json.dumps({
                                        "type": "Speak",
                                        "text": text
                                    }))
                            elif msg_type == "flush":
                                # Send Flush message to Deepgram
                                await dg_ws.send(json.dumps({"type": "Flush"}))
                        except json.JSONDecodeError:
                            # If not JSON, treat as plain text
                            if message.strip():
                                await dg_ws.send(json.dumps({
                                    "type": "Speak",
                                    "text": message
                                }))
                except WebSocketDisconnect:
                    print("[Deepgram TTS] Client disconnected")
                except Exception as e:
                    print(f"[Deepgram TTS] Error forwarding text: {e}")
            
            # Task to forward audio from Deepgram to client
            async def forward_audio():
                try:
                    async for message in dg_ws:
                        if isinstance(message, bytes):
                            # PCM audio data - forward to client
                            await websocket.send_bytes(message)
                        elif isinstance(message, str):
                            # Control frame (JSON)
                            try:
                                data = json.loads(message)
                                msg_type = data.get("type")
                                
                                if msg_type == "PlaybackFinished":
                                    # Notify client that playback finished
                                    await websocket.send_text(json.dumps({
                                        "type": "playback_finished"
                                    }))
                                elif msg_type == "Error":
                                    # Forward error to client
                                    await websocket.send_text(json.dumps({
                                        "type": "error",
                                        "message": data.get("message", "Unknown error")
                                    }))
                            except json.JSONDecodeError:
                                pass
                except Exception as e:
                    print(f"[Deepgram TTS] Error forwarding audio: {e}")
            
            # Run both tasks concurrently
            try:
                await asyncio.gather(forward_text(), forward_audio())
            except WebSocketDisconnect:
                print("[Deepgram TTS] Client disconnected")
            except Exception as e:
                print(f"[Deepgram TTS] Error: {e}")
                
    except ImportError:
        await websocket.close(
            code=1011,
            reason="websockets library not installed. Run: pip install websockets"
        )
    except Exception as e:
        print(f"[Deepgram TTS] Connection error: {e}")
        await websocket.close(code=1011, reason=f"Server error: {str(e)}")


# ============================================================================
# Hardware Client API Endpoints
# These endpoints allow RPi clients to access Firebase through the backend
# instead of directly, improving security and centralizing data access.
# ============================================================================

# Import logging for service endpoints
import logging
logger = logging.getLogger(__name__)

# Import services (lazy import to avoid errors if Firebase not configured)
try:
    from services.firebase_service import is_firebase_available, get_db
    from services.memory_service import (
        fetch_top_memories as _fetch_top_memories,
        add_memories_with_limit as _add_memories_with_limit,
        MemoryCandidate as ServiceMemoryCandidate
    )
    from services.conversation_service import (
        start_conversation_session as _start_conversation_session,
        append_conversation_chunk as _append_conversation_chunk,
        ConversationMessage as ServiceConversationMessage
    )
    FIREBASE_SERVICES_AVAILABLE = True
except ImportError as e:
    FIREBASE_SERVICES_AVAILABLE = False
    logger.warning(f"Firebase services not available: {e}")


# New request/response models for hardware client endpoints
class MemorySaveRequest(BaseModel):
    memories: List[MemoryCandidate]
    user_name: Optional[str] = None

class ConversationStartRequest(BaseModel):
    session_id: str
    mode: str = "stt"  # "realtime" or "stt"

class ConversationAppendRequest(BaseModel):
    messages: List[Dict[str, Any]]  # [{"role": "user|assistant|system", "content": "...", "ts": optional float}]

class ConversationAppendResponse(BaseModel):
    session_id: str
    was_split: bool


@app.get("/api/users/{uid}/memories/top")
async def get_top_memories(uid: str, limit: int = 10):
    """
    Get top memories for a user (for hardware clients).
    Replaces direct Firebase access from RPi.
    
    Args:
        uid: Firebase user ID
        limit: Number of top memories to fetch (default: 10)
    
    Returns:
        List of memory objects with id, text, type, importance
    """
    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )
    
    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )
    
    try:
        memories = _fetch_top_memories(uid, limit)
        return {
            "memories": [
                {
                    "id": m.id,
                    "text": m.text,
                    "type": m.type,
                    "importance": m.importance
                }
                for m in memories
            ]
        }
    except Exception as e:
        logger.error(f"Failed to fetch top memories for {uid}: {e}", exc_info=True)
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Traceback: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch memories: {str(e)}"
        )


@app.post("/api/users/{uid}/memories")
async def save_memories(uid: str, request: MemorySaveRequest):
    """
    Save memories for a user with limit enforcement (for hardware clients).
    Replaces direct Firebase access from RPi.
    
    Args:
        uid: Firebase user ID
        request: MemorySaveRequest with memories list and optional user_name
    
    Returns:
        Success message with count of saved memories
    """
    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )
    
    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )
    
    if not request.memories:
        return {"message": "No memories to save", "saved_count": 0}
    
    try:
        max_memories = int(os.getenv("MEMORY_LIMIT", "100"))
        
        # Convert to service MemoryCandidate objects
        memory_candidates = [
            ServiceMemoryCandidate(
                text=mem.text,
                type=mem.type,
                importance=mem.importance
            )
            for mem in request.memories
        ]
        
        _add_memories_with_limit(
            uid=uid,
            memories=memory_candidates,
            user_name=request.user_name,
            max_memories=max_memories
        )
        
        return {
            "message": "Memories saved successfully",
            "saved_count": len(request.memories)
        }
    except Exception as e:
        logger.error(f"Failed to save memories for {uid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save memories: {str(e)}"
        )


@app.post("/api/users/{uid}/conversations/start")
async def start_conversation(uid: str, request: ConversationStartRequest):
    """
    Start a new conversation session (for hardware clients).
    Replaces direct Firebase access from RPi.
    
    Args:
        uid: Firebase user ID
        request: ConversationStartRequest with session_id and mode
    
    Returns:
        Success message
    """
    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )
    
    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )
    
    if request.mode not in ["realtime", "stt"]:
        raise HTTPException(
            status_code=400,
            detail="Mode must be 'realtime' or 'stt'"
        )
    
    try:
        _start_conversation_session(
            uid=uid,
            session_id=request.session_id,
            mode=request.mode  # type: ignore
        )
        return {
            "message": "Conversation session started",
            "session_id": request.session_id
        }
    except Exception as e:
        logger.error(f"Failed to start conversation session for {uid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start conversation session: {str(e)}"
        )


@app.post("/api/users/{uid}/conversations/{session_id}/append", response_model=ConversationAppendResponse)
async def append_conversation(uid: str, session_id: str, request: ConversationAppendRequest):
    """
    Append messages to conversation (for hardware clients).
    Replaces direct Firebase access from RPi.
    Handles document size limits and continuation documents automatically.
    
    Args:
        uid: Firebase user ID
        session_id: Conversation session ID
        request: ConversationAppendRequest with messages list
    
    Returns:
        ConversationAppendResponse with updated session_id and was_split flag
    """
    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )
    
    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )
    
    if not request.messages:
        return ConversationAppendResponse(session_id=session_id, was_split=False)
    
    try:
        # Convert to service ConversationMessage objects
        conversation_messages = [
            ServiceConversationMessage(
                role=msg.get("role", "user"),  # type: ignore
                content=msg.get("content", ""),
                ts=msg.get("ts")
            )
            for msg in request.messages
        ]
        
        result = _append_conversation_chunk(
            uid=uid,
            session_id=session_id,
            messages=conversation_messages
        )
        
        return ConversationAppendResponse(
            session_id=result["sessionId"],
            was_split=result["wasSplit"]
        )
    except Exception as e:
        logger.error(f"Failed to append conversation for {uid}/{session_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to append conversation: {str(e)}"
        )


# =============================================================================
# Story Generation Endpoints
# =============================================================================

@app.post("/api/users/{uid}/stories/generate", response_model=StoryGenerateResponse)
@limiter.limit("50/day")
async def generate_story(request: Request, uid: str, story_request: StoryGenerateRequest, token: dict = Depends(get_current_user)):
    """
    Generate a personalized story for a child using OpenAI.

    Args:
        uid: Firebase user ID (child's account)
        story_request: StoryGenerateRequest with topics, values, length, setting

    Returns:
        StoryGenerateResponse with session_id, title, and segments
    """
    require_user_match(uid, token)

    # Check tier-based rate limit
    usage = await get_usage_summary(uid)
    limit_str = get_limit_for("story_generate", uid)
    daily_limit = int(limit_str.split("/")[0])
    current = usage.get("stories_generated", 0)
    if current >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily story limit reached ({daily_limit} stories/day). Upgrade to premium for more."
        )

    # Check OpenAI API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    # Generate unique session ID
    session_id = f"story-{uuid.uuid4().hex[:12]}"

    # Try to fetch child data from Firebase, use defaults if not available
    child_name = "Little One"
    child_age = 5

    if FIREBASE_SERVICES_AVAILABLE and is_firebase_available():
        try:
            db = get_db()
            user_doc = db.collection("users").document(uid).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                child_name = user_data.get("name", child_name)
                child_age = user_data.get("age", child_age)
        except Exception as e:
            logger.warning(f"Failed to fetch user data for {uid}: {e}, using defaults")

    # Build the story prompt
    child_profile = ChildProfile(name=child_name, age=child_age)
    service_request = ServiceStoryRequest(
        topics=story_request.topics,
        values=story_request.values,
        length=story_request.length,
        setting=story_request.setting
    )

    system_prompt = build_story_system_prompt(child_profile, service_request)
    user_prompt = get_story_user_prompt()

    # Call OpenAI API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": os.getenv("CHAT_MODEL", "gpt-4o-mini"),
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.8,
                    "max_tokens": 2000,
                    "response_format": {"type": "json_object"}
                },
                timeout=60.0,
            )

            if not response.is_success:
                error_text = response.text
                logger.error(f"OpenAI API error: {error_text}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to generate story: {error_text}"
                )

            data = response.json()
            story_json = data["choices"][0]["message"]["content"]

            # Parse the JSON response
            try:
                story_data = json.loads(story_json)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse story JSON: {e}, response: {story_json}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to parse generated story"
                )

            # Convert to response model
            segments = [
                StorySegmentResponse(
                    segment_index=seg.get("segment_index", idx),
                    narrative=seg.get("narrative", ""),
                    segment_type=seg.get("segment_type", "middle"),
                    discussion_question=seg.get("discussion_question")
                )
                for idx, seg in enumerate(story_data.get("segments", []))
            ]

            title = story_data.get("title", "A Magical Story")

            # Save story to Firebase (non-blocking, don't fail if save fails)
            if FIREBASE_SERVICES_AVAILABLE and is_firebase_available():
                try:
                    service_segments = [
                        ServiceStorySegment(
                            segment_index=seg.segment_index,
                            narrative=seg.narrative,
                            segment_type=seg.segment_type,
                            discussion_question=seg.discussion_question
                        )
                        for seg in segments
                    ]
                    _save_story_session(
                        uid=uid,
                        session_id=session_id,
                        title=title,
                        segments=service_segments,
                        request=service_request,
                        child_name=child_name,
                        child_age=child_age
                    )
                except Exception as e:
                    logger.warning(f"Failed to save story to Firebase: {e}")
                    # Don't fail the request, story was generated successfully

            # Track usage after successful generation
            await track_usage(uid, "stories_generated")

            return StoryGenerateResponse(
                session_id=session_id,
                title=title,
                segments=segments
            )

    except httpx.HTTPError as e:
        logger.error(f"Network error while calling OpenAI: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Network error while generating story: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error generating story: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )


@app.get("/api/users/{uid}/stories")
@limiter.limit("200/day")
async def list_stories(request: Request, uid: str, limit: int = 20, token: dict = Depends(get_current_user)):
    """
    List story sessions for a user.

    Args:
        uid: Firebase user ID
        limit: Maximum number of stories to return (default: 20)

    Returns:
        List of story summaries with session_id, title, created_at, status
    """
    require_user_match(uid, token)

    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )

    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )

    try:
        stories = _list_story_sessions(uid, limit)
        return {"stories": stories}
    except Exception as e:
        logger.error(f"Failed to list stories for {uid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list stories: {str(e)}"
        )


@app.get("/api/users/{uid}/stories/{session_id}")
@limiter.limit("200/day")
async def get_story(request: Request, uid: str, session_id: str, token: dict = Depends(get_current_user)):
    """
    Get a specific story session.

    Args:
        uid: Firebase user ID
        session_id: Story session ID

    Returns:
        Full story with all segments
    """
    require_user_match(uid, token)

    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )

    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )

    try:
        story = _fetch_story_session(uid, session_id)
        if story is None:
            raise HTTPException(
                status_code=404,
                detail=f"Story {session_id} not found"
            )

        return {
            "session_id": story.session_id,
            "title": story.title,
            "child_name": story.child_name,
            "child_age": story.child_age,
            "request": {
                "topics": story.request.topics,
                "values": story.request.values,
                "length": story.request.length,
                "setting": story.request.setting
            },
            "segments": [
                {
                    "segment_index": seg.segment_index,
                    "narrative": seg.narrative,
                    "segment_type": seg.segment_type,
                    "discussion_question": seg.discussion_question
                }
                for seg in story.segments
            ],
            "status": story.status,
            "created_at": story.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get story {session_id} for {uid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get story: {str(e)}"
        )


@app.patch("/api/users/{uid}/stories/{session_id}/status")
@limiter.limit("100/day")
async def update_story_status_endpoint(request: Request, uid: str, session_id: str, status: str, token: dict = Depends(get_current_user)):
    """
    Update the status of a story (e.g., mark as read or favorite).

    Args:
        uid: Firebase user ID
        session_id: Story session ID
        status: New status ("generated", "read", "favorite")

    Returns:
        Success message
    """
    require_user_match(uid, token)

    if not FIREBASE_SERVICES_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Firebase services not available. Check backend configuration."
        )

    if not is_firebase_available():
        raise HTTPException(
            status_code=503,
            detail="Firebase not configured. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )

    if status not in ("generated", "read", "favorite"):
        raise HTTPException(
            status_code=400,
            detail="Status must be 'generated', 'read', or 'favorite'"
        )

    try:
        _update_story_status(uid, session_id, status)
        return {"message": f"Story status updated to {status}"}
    except Exception as e:
        logger.error(f"Failed to update story status {session_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update story status: {str(e)}"
        )


# =============================================================================
# Static Mythological Stories (Sacred Stories)
# =============================================================================

@app.get("/api/static-stories/{story_id}")
async def get_static_story(story_id: str):
    """
    Get a static mythological story by ID.
    Public endpoint - no authentication required.

    Args:
        story_id: Story identifier (e.g., "maha-001")

    Returns:
        Complete story with all segments
    """
    try:
        from services.static_story_service import get_static_story as fetch_story

        story = await fetch_story(story_id)

        if not story:
            raise HTTPException(
                status_code=404,
                detail=f"Story {story_id} not found"
            )

        return story

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get static story {story_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get story: {str(e)}"
        )


class UpdateProgressRequest(BaseModel):
    current_segment: int
    status: str = "in_progress"


@app.post("/api/users/{uid}/static-stories/{story_id}/progress")
@limiter.limit("200/day")
async def update_static_story_progress(
    request: Request,
    uid: str,
    story_id: str,
    progress: UpdateProgressRequest,
    token: dict = Depends(get_current_user)
):
    """
    Update user's reading progress on a static story.

    Args:
        uid: User ID
        story_id: Story identifier
        progress: Progress update (current_segment, status)

    Returns:
        Updated progress and any unlocked characters
    """
    try:
        from services.static_story_service import update_story_progress, get_static_story as fetch_story
        from services.gamification_service import unlock_story_characters, get_all_character_metadata

        # Verify user matches token
        if uid != token.get("uid"):
            raise HTTPException(status_code=403, detail="Cannot update progress for another user")

        # Update progress
        updated_progress = await update_story_progress(
            uid=uid,
            story_id=story_id,
            current_segment=progress.current_segment,
            status=progress.status
        )

        # If story completed, unlock characters
        unlocked_characters = []
        if progress.status == "completed":
            # Get the story to find characters
            story_data = await fetch_story(story_id)

            if story_data:
                # Get all character metadata
                all_char_metadata = await get_all_character_metadata()

                # Unlock characters from this story
                unlocked_ids = await unlock_story_characters(uid, story_data, all_char_metadata)
                unlocked_characters = unlocked_ids

        return {
            "progress": updated_progress,
            "unlocked_characters": unlocked_characters
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update progress for {uid}/{story_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update progress: {str(e)}"
        )


@app.get("/api/users/{uid}/characters")
@limiter.limit("200/day")
async def get_user_characters(
    request: Request,
    uid: str,
    token: dict = Depends(get_current_user)
):
    """
    Get all unlocked characters for a user.

    Args:
        uid: User ID

    Returns:
        List of unlocked character cards
    """
    try:
        from services.gamification_service import get_user_characters as fetch_chars

        # Verify user matches token
        if uid != token.get("uid"):
            raise HTTPException(status_code=403, detail="Cannot access another user's characters")

        characters = await fetch_chars(uid)

        return {
            "characters": characters,
            "total_unlocked": len(characters)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get characters for {uid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get characters: {str(e)}"
        )


# =============================================================================
# Subscription Endpoint
# =============================================================================

class SubscriptionStatus(BaseModel):
    tier: str
    stories_used_today: int
    stories_limit: int
    expires_at: Optional[str] = None


@app.get("/api/users/{uid}/subscription", response_model=SubscriptionStatus)
async def get_subscription_status(request: Request, uid: str, token: dict = Depends(get_current_user)):
    """
    Get subscription status for a user.
    Returns tier, daily usage, and limits.
    """
    require_user_match(uid, token)
    usage = await get_usage_summary(uid)
    tier = usage.get("tier", "free")
    stories_used = usage.get("stories_generated", 0)
    limits = usage.get("limits", {})

    # Parse limit string like "2/day" to extract the number
    limit_str = limits.get("story_generate", "2/day")
    try:
        stories_limit = int(str(limit_str).split("/")[0])
    except (ValueError, AttributeError, IndexError):
        stories_limit = 2

    return SubscriptionStatus(
        tier=tier,
        stories_used_today=stories_used,
        stories_limit=stories_limit,
        expires_at=None,
    )


# =============================================================================
# Usage Tracking Endpoint
# =============================================================================

@app.get("/api/users/{uid}/usage")
async def get_user_usage(request: Request, uid: str, token: dict = Depends(get_current_user)):
    """
    Get today's API usage summary for a user.
    Returns current counts and tier-based limits.
    """
    require_user_match(uid, token)
    usage = await get_usage_summary(uid)
    return usage


# =============================================================================
# Notification Endpoints
# =============================================================================

class FCMTokenRequest(BaseModel):
    token: str
    platform: str


class NotificationOpenedRequest(BaseModel):
    notification_id: str


@app.post("/api/users/{uid}/fcm-token")
async def register_fcm_token(
    request: Request,
    uid: str,
    body: FCMTokenRequest,
    token: dict = Depends(get_current_user)
):
    """Register or update FCM token for push notifications."""
    require_user_match(uid, token)

    from services.notification_service import store_fcm_token
    success = await store_fcm_token(uid, body.token, body.platform)

    if success:
        return {"status": "ok", "message": "FCM token registered"}
    else:
        raise HTTPException(status_code=500, detail="Failed to store FCM token")


@app.delete("/api/users/{uid}/fcm-token")
async def remove_fcm_token_endpoint(
    request: Request,
    uid: str,
    fcm_token: str,
    token: dict = Depends(get_current_user)
):
    """Remove FCM token (e.g., on logout)."""
    require_user_match(uid, token)

    from services.notification_service import remove_fcm_token
    await remove_fcm_token(uid, fcm_token)

    return {"status": "ok"}


@app.post("/api/users/{uid}/notification-opened")
async def track_notification_opened_endpoint(
    request: Request,
    uid: str,
    body: NotificationOpenedRequest,
    token: dict = Depends(get_current_user)
):
    """Track when a user opens a notification."""
    require_user_match(uid, token)

    from services.notification_service import track_notification_opened
    await track_notification_opened(uid, body.notification_id)

    return {"status": "ok"}


# =============================================================================
# Admin Campaign Endpoints
# =============================================================================

class CampaignCreateRequest(BaseModel):
    name: str
    active: bool = False
    trigger: dict
    audience: dict
    content: dict
    variants: list = []


class CampaignUpdateRequest(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    trigger: Optional[dict] = None
    audience: Optional[dict] = None
    content: Optional[dict] = None
    variants: Optional[list] = None


def require_admin(token: dict):
    """Check if the user has admin privileges."""
    # For now, just check if user is authenticated
    # In production, check user's admin status in Firestore
    if not token or "uid" not in token:
        raise HTTPException(status_code=403, detail="Admin access required")


@app.get("/api/admin/campaigns")
async def list_campaigns_endpoint(
    request: Request,
    active_only: bool = False,
    token: dict = Depends(get_current_user)
):
    """List all notification campaigns."""
    require_admin(token)

    from services.campaign_service import list_campaigns
    campaigns = await list_campaigns(active_only=active_only)

    return {
        "campaigns": [c.to_dict() for c in campaigns],
        "count": len(campaigns),
    }


@app.post("/api/admin/campaigns")
async def create_campaign_endpoint(
    request: Request,
    body: CampaignCreateRequest,
    token: dict = Depends(get_current_user)
):
    """Create a new notification campaign."""
    require_admin(token)

    from services.campaign_service import create_campaign

    campaign_data = {
        "name": body.name,
        "active": body.active,
        "trigger": body.trigger,
        "audience": body.audience,
        "content": body.content,
        "variants": body.variants,
    }

    campaign = await create_campaign(campaign_data)
    return campaign.to_dict()


@app.get("/api/admin/campaigns/{campaign_id}")
async def get_campaign_endpoint(
    request: Request,
    campaign_id: str,
    token: dict = Depends(get_current_user)
):
    """Get a specific campaign."""
    require_admin(token)

    from services.campaign_service import get_campaign
    campaign = await get_campaign(campaign_id)

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return campaign.to_dict()


@app.put("/api/admin/campaigns/{campaign_id}")
async def update_campaign_endpoint(
    request: Request,
    campaign_id: str,
    body: CampaignUpdateRequest,
    token: dict = Depends(get_current_user)
):
    """Update a campaign."""
    require_admin(token)

    from services.campaign_service import update_campaign

    # Build updates dict from non-None fields
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.active is not None:
        updates["active"] = body.active
    if body.trigger is not None:
        updates["trigger"] = body.trigger
    if body.audience is not None:
        updates["audience"] = body.audience
    if body.content is not None:
        updates["content"] = body.content
    if body.variants is not None:
        updates["variants"] = body.variants

    campaign = await update_campaign(campaign_id, updates)

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return campaign.to_dict()


@app.delete("/api/admin/campaigns/{campaign_id}")
async def delete_campaign_endpoint(
    request: Request,
    campaign_id: str,
    token: dict = Depends(get_current_user)
):
    """Delete a campaign."""
    require_admin(token)

    from services.campaign_service import delete_campaign
    success = await delete_campaign(campaign_id)

    if not success:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return {"status": "ok", "message": "Campaign deleted"}


@app.get("/api/admin/campaigns/{campaign_id}/stats")
async def get_campaign_stats_endpoint(
    request: Request,
    campaign_id: str,
    token: dict = Depends(get_current_user)
):
    """Get campaign statistics."""
    require_admin(token)

    from services.campaign_service import get_campaign_stats
    stats = await get_campaign_stats(campaign_id)

    if stats is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return stats


# =============================================================================
# Notification Scheduler Endpoint
# =============================================================================

def require_internal_key(api_key: str = Header(None, alias="X-Internal-API-Key")):
    """Verify internal API key for scheduler endpoint."""
    expected_key = os.getenv("INTERNAL_API_KEY", "dev-internal-key")
    if api_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid internal API key")


@app.post("/api/internal/process-notifications")
async def process_notifications_endpoint(
    request: Request,
    _api_key: str = Depends(require_internal_key)
):
    """
    Process all active notification campaigns.
    This endpoint should be called by a cron job (e.g., every 15 minutes).
    Protected by internal API key.
    """
    from services.notification_scheduler import process_all_campaigns

    try:
        stats = await process_all_campaigns()
        return {
            "status": "ok",
            "stats": stats,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Failed to process notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/internal/process-campaign/{campaign_id}")
async def process_single_campaign_endpoint(
    campaign_id: str,
    _api_key: str = Depends(require_internal_key)
):
    """
    Process a single specific notification campaign.
    Useful for testing or sending one-off campaigns.
    Protected by internal API key.
    """
    from services.notification_scheduler import process_single_campaign

    try:
        stats = await process_single_campaign(campaign_id)
        return {
            "status": "ok",
            "campaign_id": campaign_id,
            "stats": stats,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Failed to process campaign {campaign_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/test/create-campaign-no-auth")
async def create_test_campaign_no_auth(request: Request):
    """
    TEMPORARY: Create a test campaign without authentication.
    Remove this endpoint in production!
    """
    from services.campaign_service import create_campaign

    # Accept custom campaign data from request body
    try:
        body = await request.json()
    except:
        body = {}

    # Use provided data or defaults
    campaign_data = {
        "name": body.get("name", "Test Push Notification"),
        "active": True,
        "trigger": body.get("trigger", {
            "type": "immediate",
        }),
        "audience": body.get("audience", {
            "tier": ["free", "premium"],
        }),
        "content": body.get("content", {
            "title": "Test from Your Story! 👋",
            "body": "Ready to create a magical story together?",
            "deep_link": "/stories/create"
        }),
        "variants": body.get("variants", [])
    }

    try:
        campaign = await create_campaign(campaign_data)
        return {
            "status": "ok",
            "message": "Test campaign created",
            "campaign": campaign.to_dict()
        }
    except Exception as e:
        logger.error(f"Failed to create test campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/campaigns/{campaign_id}/send-test")
async def send_test_notification_endpoint(
    request: Request,
    campaign_id: str,
    token: dict = Depends(get_current_user)
):
    """
    Send a test notification for a campaign to the current user.
    Useful for testing campaign content before activating.
    """
    require_admin(token)

    from services.campaign_service import get_campaign, select_variant
    from services.notification_service import send_notification_to_user

    campaign = await get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    uid = token["uid"]

    # Select content variant
    content = select_variant(campaign, uid)

    # Send test notification
    title = content.get("title", "Test Notification")
    body = content.get("body", "This is a test notification")
    deep_link = content.get("deep_link", "")

    sent_count = await send_notification_to_user(
        uid=uid,
        title=title,
        body=body,
        data={
            "deep_link": deep_link,
            "campaign_id": campaign_id,
            "notification_id": f"test-{campaign_id}",
        },
    )

    if sent_count > 0:
        return {"status": "ok", "message": f"Test notification sent to {sent_count} device(s)"}
    else:
        return {"status": "error", "message": "No FCM tokens found for user"}


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )

