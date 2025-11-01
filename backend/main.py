"""
Voice AI Buddy Backend API
Handles ephemeral token generation for OpenAI Realtime API
Future: Hardware control, ML models, parental insights
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import httpx
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

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
    model: str = "gpt-4o-mini"


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
    Uses gpt-4o-mini model for cost-effective text-to-text processing.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": request.model,
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


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """
    Text-to-Speech API endpoint using OpenAI TTS API.
    Returns audio file for playback.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set on the server"
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": request.text,
                    "voice": request.voice,
                },
                timeout=30.0,
            )

            if not response.is_success:
                error_text = response.text
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to generate speech: {error_text}"
                )

            # Return audio file directly
            from fastapi.responses import Response
            return Response(
                content=response.content,
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": "inline; filename=speech.mp3"
                }
            )

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


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )

