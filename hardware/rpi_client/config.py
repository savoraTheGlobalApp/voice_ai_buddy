"""
Configuration management for RPi client.
Loads local environment variables and fetches company-controlled settings from backend (OTA).
"""
import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load .env file from hardware/ directory
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

logger = logging.getLogger(__name__)


class Config:
    """
    Centralized configuration with OTA support.
    
    Local config (user/hardware-specific): Loaded from .env
    Remote config (company-controlled): Fetched from backend on startup
    """
    
    # Backend API (local)
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    
    # User Information (local)
    USER_UID: Optional[str] = os.getenv("USER_UID")
    USER_NAME: Optional[str] = os.getenv("USER_NAME")
    USER_AGE: Optional[int] = None
    _age_str = os.getenv("USER_AGE")
    if _age_str:
        try:
            USER_AGE = int(_age_str)
        except ValueError:
            pass
    
    # Audio Configuration (local, hardware-specific)
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
    
    # Logging (local)
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
    
    # Remote configuration (company-controlled, OTA-updatable)
    _remote_config: Optional[Dict[str, Any]] = None
    _config_fetched: bool = False
    
    # Fallback defaults (used if remote config fetch fails)
    _FALLBACK_STT_PROVIDER = "googlecloud"
    _FALLBACK_TTS_PROVIDER = "gtts"
    _FALLBACK_CHAT_MODEL = "gpt-4o-mini"
    _FALLBACK_TOP_MEMORIES_COUNT = 10
    _FALLBACK_MEMORY_LIMIT = 100
    _FALLBACK_SAMPLE_RATE = 16000
    _FALLBACK_CHUNK_SIZE = 2048
    
    @classmethod
    async def fetch_remote_config(cls, api_client) -> bool:
        """
        Fetch company-controlled configuration from backend.
        
        Args:
            api_client: APIClient instance to use for fetching config
        
        Returns:
            True if config was fetched successfully, False otherwise
        """
        try:
            remote_config = await api_client.get_hardware_config()
            cls._remote_config = remote_config
            cls._config_fetched = True
            logger.info("Successfully fetched remote configuration from backend")
            logger.debug(f"Remote config: {remote_config}")
            return True
        except Exception as e:
            logger.warning(f"Failed to fetch remote configuration: {e}. Using fallback defaults.")
            cls._remote_config = None
            cls._config_fetched = True  # Mark as fetched to prevent retry loops
            return False
    
    @classmethod
    def _get_remote_value(cls, key: str, fallback: Any) -> Any:
        """Get value from remote config or fallback."""
        if cls._remote_config and key in cls._remote_config:
            return cls._remote_config[key]
        return fallback
    
    @classmethod
    async def get_stt_provider(cls) -> str:
        """Get STT provider from remote config or fallback."""
        return cls._get_remote_value("stt_provider", cls._FALLBACK_STT_PROVIDER)
    
    @classmethod
    async def get_tts_provider(cls) -> str:
        """Get TTS provider from remote config or fallback."""
        return cls._get_remote_value("tts_provider", cls._FALLBACK_TTS_PROVIDER)
    
    @classmethod
    async def get_chat_model(cls) -> str:
        """Get chat model from remote config or fallback."""
        return cls._get_remote_value("chat_model", cls._FALLBACK_CHAT_MODEL)
    
    @classmethod
    async def get_top_memories_count(cls) -> int:
        """Get top memories count from remote config or fallback."""
        return cls._get_remote_value("top_memories_count", cls._FALLBACK_TOP_MEMORIES_COUNT)
    
    @classmethod
    async def get_memory_limit(cls) -> int:
        """Get memory limit from remote config or fallback."""
        return cls._get_remote_value("memory_limit", cls._FALLBACK_MEMORY_LIMIT)
    
    @classmethod
    async def get_sample_rate(cls) -> int:
        """Get sample rate from remote config or fallback."""
        return cls._get_remote_value("sample_rate", cls._FALLBACK_SAMPLE_RATE)
    
    @classmethod
    async def get_chunk_size(cls) -> int:
        """Get chunk size from remote config or fallback."""
        return cls._get_remote_value("chunk_size", cls._FALLBACK_CHUNK_SIZE)
    
    @classmethod
    def validate(cls) -> list[str]:
        """
        Validate local configuration and return list of errors.
        Remote config validation happens after fetch.
        """
        errors = []
        
        if not cls.USER_UID:
            errors.append("USER_UID is required")
        
        if not cls.USER_NAME:
            errors.append("USER_NAME is required")
        
        return errors
    
    @classmethod
    async def validate_remote_config(cls) -> list[str]:
        """
        Validate remote configuration after fetch.
        Returns list of errors, empty if valid.
        """
        errors = []
        
        if not cls._config_fetched:
            errors.append("Remote configuration not fetched yet")
            return errors
        
        if cls._remote_config:
            stt_provider = await cls.get_stt_provider()
            if stt_provider not in ["googlecloud", "deepgram"]:
                errors.append(f"Invalid STT_PROVIDER from backend: {stt_provider}. Must be 'googlecloud' or 'deepgram'")
            
            tts_provider = await cls.get_tts_provider()
            if tts_provider not in ["gtts", "openai", "edge", "deepgram"]:
                errors.append(f"Invalid TTS_PROVIDER from backend: {tts_provider}. Must be 'gtts', 'openai', 'edge', or 'deepgram'")
        
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

