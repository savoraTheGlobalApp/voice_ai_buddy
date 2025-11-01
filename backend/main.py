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
from typing import Optional
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


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )

