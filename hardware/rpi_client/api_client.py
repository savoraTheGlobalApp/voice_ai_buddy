"""
API client for backend communication.
Handles STT (WebSocket), Chat API, TTS API, and memory extraction.
"""
import logging
import json
import asyncio
import websockets
import httpx
from typing import Optional, Callable, AsyncGenerator
from dataclasses import dataclass

from .config import config
from .memory_manager import MemoryCandidate

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """Chat message for conversation."""
    role: str
    content: str


class APIClient:
    """Client for backend API communication."""
    
    def __init__(self):
        """Initialize API client."""
        self.backend_url = config.get_backend_url()
        self.ws_url = config.get_ws_url()
        self.stt_websocket: Optional[websockets.WebSocketClientProtocol] = None
    
    async def connect_stt(self, on_transcript: Callable[[str], None]) -> AsyncGenerator[None, None]:
        """
        Connect to STT WebSocket and stream audio.
        
        Args:
            on_transcript: Callback function called when transcript is received
        
        Yields:
            Control flow (use with async for)
        """
        stt_provider = config.STT_PROVIDER
        
        if stt_provider == "googlecloud":
            async for _ in self._connect_googlecloud_stt(on_transcript):
                yield
        elif stt_provider == "deepgram":
            async for _ in self._connect_deepgram_stt(on_transcript):
                yield
        else:
            raise ValueError(f"Unsupported STT provider: {stt_provider}")
    
    async def _connect_googlecloud_stt(self, on_transcript: Callable[[str], None]) -> AsyncGenerator[None, None]:
        """Connect to Google Cloud STT WebSocket."""
        ws_endpoint = f"{self.ws_url}/api/stt/googlecloud"
        
        try:
            async with websockets.connect(ws_endpoint) as ws:
                self.stt_websocket = ws
                logger.info("Connected to Google Cloud STT WebSocket")
                
                # Task to receive transcripts
                async def receive_transcripts():
                    try:
                        async for message in ws:
                            try:
                                data = json.loads(message)
                                if data.get("type") == "transcript":
                                    transcript = data.get("text", "").strip()
                                    if transcript:
                                        logger.info(f"Received transcript: {transcript}")
                                        on_transcript(transcript)
                            except json.JSONDecodeError:
                                logger.warning(f"Invalid JSON from STT: {message}")
                            except Exception as e:
                                logger.error(f"Error processing transcript: {e}")
                    except websockets.exceptions.ConnectionClosed:
                        logger.info("STT WebSocket closed")
                    except Exception as e:
                        logger.error(f"Error receiving transcripts: {e}")
                
                # Start receiving transcripts
                receive_task = asyncio.create_task(receive_transcripts())
                
                # Yield control (caller will send audio)
                try:
                    yield
                finally:
                    receive_task.cancel()
                    try:
                        await receive_task
                    except asyncio.CancelledError:
                        pass
        
        except Exception as e:
            logger.error(f"Failed to connect to STT WebSocket: {e}")
            raise
    
    async def _connect_deepgram_stt(self, on_transcript: Callable[[str], None]) -> AsyncGenerator[None, None]:
        """Connect to Deepgram STT WebSocket."""
        ws_endpoint = f"{self.ws_url}/api/stt/deepgram"
        
        try:
            async with websockets.connect(ws_endpoint) as ws:
                self.stt_websocket = ws
                logger.info("Connected to Deepgram STT WebSocket")
                
                # Task to receive transcripts
                async def receive_transcripts():
                    try:
                        async for message in ws:
                            try:
                                data = json.loads(message)
                                if data.get("type") == "transcript":
                                    transcript = data.get("text", "").strip()
                                    if transcript:
                                        logger.info(f"Received transcript: {transcript}")
                                        on_transcript(transcript)
                            except json.JSONDecodeError:
                                logger.warning(f"Invalid JSON from STT: {message}")
                            except Exception as e:
                                logger.error(f"Error processing transcript: {e}")
                    except websockets.exceptions.ConnectionClosed:
                        logger.info("STT WebSocket closed")
                    except Exception as e:
                        logger.error(f"Error receiving transcripts: {e}")
                
                # Start receiving transcripts
                receive_task = asyncio.create_task(receive_transcripts())
                
                # Yield control (caller will send audio)
                try:
                    yield
                finally:
                    receive_task.cancel()
                    try:
                        await receive_task
                    except asyncio.CancelledError:
                        pass
        
        except Exception as e:
            logger.error(f"Failed to connect to STT WebSocket: {e}")
            raise
    
    async def send_audio_chunk(self, audio_data: bytes) -> None:
        """
        Send audio chunk to STT WebSocket.
        
        Args:
            audio_data: Audio data as bytes (Int16 PCM)
        """
        if not self.stt_websocket:
            logger.warning("STT WebSocket not connected")
            return
        
        try:
            await self.stt_websocket.send(audio_data)
        except Exception as e:
            logger.error(f"Failed to send audio chunk: {e}")
            raise
    
    async def chat(self, messages: list[ChatMessage], model: Optional[str] = None) -> str:
        """
        Send chat request and get response.
        
        Args:
            messages: List of chat messages
            model: Optional model override (default from config)
        
        Returns:
            Assistant response text
        """
        model = model or config.CHAT_MODEL
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.backend_url}/api/chat",
                    json={
                        "messages": [
                            {"role": msg.role, "content": msg.content}
                            for msg in messages
                        ],
                        "model": model
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "")
            except httpx.HTTPError as e:
                logger.error(f"Chat API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error in chat: {e}")
                raise
    
    async def tts(self, text: str, voice: str = "nova", provider: Optional[str] = None) -> bytes:
        """
        Generate speech from text.
        
        Args:
            text: Text to convert to speech
            voice: Voice name (for OpenAI TTS)
            provider: Optional TTS provider override (default from config)
        
        Returns:
            Audio data as bytes (MP3 format)
        """
        provider = provider or config.TTS_PROVIDER
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.backend_url}/api/tts",
                    json={
                        "text": text,
                        "voice": voice,
                        "provider": provider
                    }
                )
                response.raise_for_status()
                return response.content
            except httpx.HTTPError as e:
                logger.error(f"TTS API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error in TTS: {e}")
                raise
    
    async def extract_memories(
        self,
        messages: list[ChatMessage],
        top_k: int = 5,
        existing_memories: Optional[list[str]] = None
    ) -> list[MemoryCandidate]:
        """
        Extract memories from conversation.
        
        Args:
            messages: Recent conversation messages
            top_k: Number of memories to extract
            existing_memories: List of existing memory texts to avoid duplicates
        
        Returns:
            List of memory candidates
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.backend_url}/api/memories/extract",
                    json={
                        "messages": [
                            {"role": msg.role, "content": msg.content}
                            for msg in messages
                        ],
                        "top_k": top_k,
                        "existing_memories": existing_memories or []
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                memories = []
                for mem_data in data.get("memories", []):
                    memories.append(MemoryCandidate(
                        text=mem_data.get("text", ""),
                        type=mem_data.get("type", "facts"),
                        importance=mem_data.get("importance", 3)
                    ))
                
                return memories
            except httpx.HTTPError as e:
                logger.error(f"Memory extraction API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error in memory extraction: {e}")
                raise
    
    async def close(self) -> None:
        """Close API client connections."""
        if self.stt_websocket:
            try:
                await self.stt_websocket.close()
            except Exception as e:
                logger.error(f"Error closing STT WebSocket: {e}")
            finally:
                self.stt_websocket = None

