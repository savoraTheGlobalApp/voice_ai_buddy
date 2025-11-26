"""
Voice AI Buddy Backend API
Handles ephemeral token generation for OpenAI Realtime API
Future: Hardware control, ML models, parental insights
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
import os
import re
import httpx
import json
import asyncio
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

# Load environment variables from .env file
load_dotenv()

# Deepgram STT endpointing configuration (silence duration in milliseconds before finalizing transcript)
# Lower values = faster response but may split sentences on natural pauses
# Higher values = more natural but slightly higher latency
# Recommended: 1200ms (1.2 seconds) for real-time conversation
DEEPGRAM_STT_ENDPOINTING_MS = 100

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
    Get all backend configuration for admin settings.
    Returns STT provider, TTS provider, and Chat model.
    Note: Mode selection (realtime vs STT-TTT-TTS) is handled by frontend via NEXT_PUBLIC_USE_STT_MODE.
    """
    stt_provider = _get_stt_provider()
    tts_provider = os.getenv("TTS_PROVIDER", "gtts").lower()
    chat_model = os.getenv("CHAT_MODEL", "gpt-4o-mini")
    
    # Check if Deepgram TTS is available (requires DEEPGRAM_API_KEY)
    deepgram_tts_available = bool(os.getenv("DEEPGRAM_API_KEY"))
    
    return {
        "stt_provider": stt_provider,
        "tts_provider": tts_provider,
        "chat_model": chat_model,
        "deepgram_tts_available": deepgram_tts_available,
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


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )

