"""
Configuration management for RPi client.
Loads and validates environment variables with sensible defaults.
"""
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load .env file from hardware/ directory
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)


class Config:
    """Centralized configuration with validation."""
    
    # Backend API
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    
    # Firebase Configuration
    FIREBASE_CREDENTIALS_PATH: str = os.getenv(
        "FIREBASE_CREDENTIALS_PATH", 
        str(Path(__file__).parent.parent.parent / "backend" / "service-account-key.json")
    )
    
    # User Information
    USER_UID: Optional[str] = os.getenv("USER_UID")
    USER_NAME: Optional[str] = os.getenv("USER_NAME")
    USER_AGE: Optional[int] = None
    _age_str = os.getenv("USER_AGE")
    if _age_str:
        try:
            USER_AGE = int(_age_str)
        except ValueError:
            pass
    
    # Audio Configuration
    AUDIO_INPUT_DEVICE: Optional[int] = None
    _input_device = os.getenv("AUDIO_INPUT_DEVICE")
    if _input_device:
        try:
            AUDIO_INPUT_DEVICE = int(_input_device)
        except ValueError:
            pass
    
    AUDIO_OUTPUT_DEVICE: Optional[int] = None
    _output_device = os.getenv("AUDIO_OUTPUT_DEVICE")
    if _output_device:
        try:
            AUDIO_OUTPUT_DEVICE = int(_output_device)
        except ValueError:
            pass
    
    # Audio Processing
    SAMPLE_RATE: int = int(os.getenv("SAMPLE_RATE", "16000"))  # 16kHz for STT
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "2048"))  # Audio buffer size
    
    # STT Configuration (default: Google Cloud STT)
    STT_PROVIDER: str = os.getenv("STT_PROVIDER", "googlecloud").lower()
    # Options: googlecloud, deepgram
    
    # TTT Configuration (default: OpenAI gpt-4o-mini)
    CHAT_MODEL: str = os.getenv("CHAT_MODEL", "gpt-4o-mini")
    
    # TTS Configuration (default: gTTS)
    TTS_PROVIDER: str = os.getenv("TTS_PROVIDER", "gtts").lower()
    # Options: gtts, openai, edge, deepgram
    
    # Memory Configuration
    TOP_MEMORIES_COUNT: int = int(os.getenv("TOP_MEMORIES_COUNT", "10"))
    MEMORY_LIMIT: int = int(os.getenv("MEMORY_LIMIT", "100"))
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
    
    @classmethod
    def validate(cls) -> list[str]:
        """
        Validate configuration and return list of errors.
        Returns empty list if all valid.
        """
        errors = []
        
        if not cls.USER_UID:
            errors.append("USER_UID is required")
        
        if not cls.USER_NAME:
            errors.append("USER_NAME is required")
        
        if not Path(cls.FIREBASE_CREDENTIALS_PATH).exists():
            errors.append(f"Firebase credentials not found at: {cls.FIREBASE_CREDENTIALS_PATH}")
        
        if cls.STT_PROVIDER not in ["googlecloud", "deepgram"]:
            errors.append(f"Invalid STT_PROVIDER: {cls.STT_PROVIDER}. Must be 'googlecloud' or 'deepgram'")
        
        if cls.TTS_PROVIDER not in ["gtts", "openai", "edge", "deepgram"]:
            errors.append(f"Invalid TTS_PROVIDER: {cls.TTS_PROVIDER}. Must be 'gtts', 'openai', 'edge', or 'deepgram'")
        
        return errors
    
    @classmethod
    def get_backend_url(cls) -> str:
        """Get backend URL, ensuring no trailing slash."""
        return cls.BACKEND_URL.rstrip("/")
    
    @classmethod
    def get_ws_url(cls) -> str:
        """Get WebSocket URL for backend."""
        base = cls.get_backend_url()
        if base.startswith("http://"):
            return base.replace("http://", "ws://")
        elif base.startswith("https://"):
            return base.replace("https://", "wss://")
        return f"ws://{base}"


# Global config instance
config = Config()

