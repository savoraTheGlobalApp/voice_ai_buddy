"""
Voice AI Buddy Backend API
Handles ephemeral token generation for OpenAI Realtime API
Future: Hardware control, ML models, parental insights
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import os
import httpx
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        audio_data = audio_buffer.read()
        
        if not audio_data:
            raise Exception("No audio data generated from gTTS")
        
        return audio_data
    except Exception as e:
        raise Exception(f"gTTS error: {str(e)}")


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


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )

