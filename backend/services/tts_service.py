"""
TTS Provider Architecture for custom stories.

Pluggable TTS providers — switch via TTS_PROVIDER env var:
  google_chirp3hd  (default) — Google Cloud Chirp 3 HD
  google_wavenet   — Google Cloud WaveNet
  openai           — OpenAI TTS (shimmer/nova)

Add new providers by creating a class + adding an env var option in get_tts_provider().
"""
import os
import logging
from abc import ABC, abstractmethod
from typing import Optional

logger = logging.getLogger(__name__)

# Block types to skip for TTS (no text content to synthesize)
SKIP_TYPES = {"divider", "audio", "image"}

# Which field holds the narration text for each block type
BLOCK_TEXT_FIELD = {
    "hook":            "content",
    "text":            "content",
    "story_body":      "content",
    "blessing":        "content",
    "reflection":      "question",
    "discussion":      "question",
    "quiz":            "question",
    "value_highlight": "explanation",
    "character_intro": "name",
}


def extract_block_text(block: dict, language: str) -> Optional[str]:
    """
    Extract narration text from a block for the given language.

    Returns None for blocks that should be skipped or have no text content.
    """
    btype = block.get("type", "")
    if btype in SKIP_TYPES:
        return None
    field = BLOCK_TEXT_FIELD.get(btype)
    if not field:
        return None
    val = block.get(field)
    if isinstance(val, dict):
        text = (val.get(language) or "").strip()
    else:
        text = (val or "").strip()
    return text or None


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str, language: str) -> bytes:
        """Synthesize text to speech. Returns MP3 bytes."""
        pass


class OpenAITTSProvider(TTSProvider):
    """OpenAI TTS provider using tts-1 model (shimmer/nova voices)."""

    VOICES = {"en": "shimmer", "hi": "nova"}

    async def synthesize(self, text: str, language: str) -> bytes:
        import httpx
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not configured")

        voice = self.VOICES.get(language, "shimmer")
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": text,
                    "voice": voice,
                    "response_format": "mp3",
                },
                timeout=60.0,
            )
            r.raise_for_status()
            return r.content


def _get_google_credentials():
    """
    Load Google credentials from GOOGLE_APPLICATION_CREDENTIALS (file path)
    or GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY (JSON string in env).
    Returns a Credentials object, or None to use ADC.
    """
    import json
    key_json = os.environ.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
    if key_json:
        try:
            from google.oauth2 import service_account
            info = json.loads(key_json)
            return service_account.Credentials.from_service_account_info(
                info,
                scopes=["https://www.googleapis.com/auth/cloud-platform"],
            )
        except Exception as e:
            logger.warning(f"Failed to load Google credentials from env JSON: {e}")
    return None  # Fall back to ADC / GOOGLE_APPLICATION_CREDENTIALS file


class GoogleTTSProvider(TTSProvider):
    """
    Google Cloud TTS provider.

    model:
      "chirp3hd"  — Chirp 3 HD (highest quality, plain text only, no SSML)
      "neural2"   — Neural2 with SSML prosody tags (good for kids: warm, slightly slow)
      "wavenet"   — WaveNet with SSML prosody tags
    """

    VOICES = {
        "chirp3hd": {
            "en": "en-US-Chirp3-HD-Aoede",
            "hi": "hi-IN-Chirp3-HD-Aoede",
        },
        "neural2": {
            "en": "en-US-Neural2-F",
            "hi": "hi-IN-Neural2-A",
        },
        "wavenet": {
            "en": "en-US-Wavenet-F",
            "hi": "hi-IN-Wavenet-A",
        },
    }

    LANGUAGE_CODES = {
        "en": "en-US",
        "hi": "hi-IN",
    }

    # SSML prosody for kids: slightly slower, slightly warmer pitch
    KIDS_SSML = '<speak><prosody rate="90%" pitch="+1.5st">{text}</prosody></speak>'

    def __init__(self, model: str = "chirp3hd"):
        self.model = model
        # chirp3hd uses plain text; neural2/wavenet use SSML for prosody control
        self.use_ssml = model in ("neural2", "wavenet")

    async def synthesize(self, text: str, language: str) -> bytes:
        import asyncio
        from google.cloud import texttospeech

        voice_name = self.VOICES.get(self.model, {}).get(language)
        lang_code = self.LANGUAGE_CODES.get(language, "en-US")

        if not voice_name:
            raise ValueError(f"No voice configured for model={self.model} lang={language}")

        credentials = _get_google_credentials()

        def _synthesize_sync() -> bytes:
            client = texttospeech.TextToSpeechClient(credentials=credentials)

            if self.use_ssml:
                ssml = self.KIDS_SSML.format(text=text)
                synthesis_input = texttospeech.SynthesisInput(ssml=ssml)
            else:
                synthesis_input = texttospeech.SynthesisInput(text=text)

            voice = texttospeech.VoiceSelectionParams(
                language_code=lang_code,
                name=voice_name,
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
            )
            response = client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )
            return response.audio_content

        return await asyncio.to_thread(_synthesize_sync)


def get_tts_provider() -> TTSProvider:
    """
    Factory: returns the configured TTS provider.

    Env var STORY_TTS_PROVIDER controls which provider is used:
        google_neural2   (default) — Neural2 + SSML prosody for kids (warm, slightly slow)
        google_chirp3hd  — highest quality, no SSML prosody control
        google_wavenet   — WaveNet + SSML prosody for kids
        openai           — shimmer (EN) / nova (HI)

    Google providers load credentials from GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY (JSON env var)
    or GOOGLE_APPLICATION_CREDENTIALS (file path), falling back to ADC.

    To add a new provider: create a class above, then add an elif branch here.
    """
    provider_name = os.environ.get("STORY_TTS_PROVIDER", "google_neural2").lower()

    if provider_name == "openai":
        logger.info("Story TTS provider: OpenAI (shimmer/nova)")
        return OpenAITTSProvider()
    elif provider_name == "google_neural2":
        logger.info("Story TTS provider: Google Neural2 + SSML prosody (kids)")
        return GoogleTTSProvider(model="neural2")
    elif provider_name == "google_wavenet":
        logger.info("Story TTS provider: Google WaveNet + SSML prosody (kids)")
        return GoogleTTSProvider(model="wavenet")
    else:
        # Default: google_chirp3hd — credentials from env JSON or ADC
        logger.info("Story TTS provider: Google Chirp 3 HD (default)")
        return GoogleTTSProvider(model="chirp3hd")
