"""
API client for backend communication.
Handles STT (WebSocket), Chat API, TTS API, and memory extraction.
"""
import logging
import json
import asyncio
import websockets
import httpx
from typing import Optional, Callable, AsyncGenerator, List, Awaitable
from dataclasses import dataclass

from .config import config

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """Chat message for conversation."""
    role: str
    content: str


@dataclass
class MemoryCandidate:
    """Memory candidate from extraction API."""
    text: str
    type: str
    importance: int


class APIClient:
    """Client for backend API communication."""
    
    def __init__(self):
        """Initialize API client."""
        self.backend_url = config.get_backend_url()
        self.ws_url = config.get_ws_url()
        self.stt_websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.tts_websocket: Optional[websockets.WebSocketClientProtocol] = None
    
    async def get_hardware_config(self) -> dict:
        """
        Fetch hardware-specific configuration from backend.
        Returns company-controlled settings (OTA-updatable).
        
        Returns:
            Dict with stt_provider, tts_provider, chat_model, top_memories_count,
            memory_limit, sample_rate, chunk_size
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(f"{self.backend_url}/api/config/hardware")
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error(f"Failed to fetch hardware config: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error fetching hardware config: {e}")
                raise
    
    async def connect_stt(self, on_transcript: Callable[[str], Awaitable[None]]) -> AsyncGenerator[None, None]:
        """
        Connect to STT WebSocket and stream audio.
        
        Args:
            on_transcript: Callback function called when transcript is received
        
        Yields:
            Control flow (use with async for)
        """
        stt_provider = await config.get_stt_provider()
        
        if stt_provider == "googlecloud":
            async for _ in self._connect_googlecloud_stt(on_transcript):
                yield
        elif stt_provider == "deepgram":
            async for _ in self._connect_deepgram_stt(on_transcript):
                yield
        else:
            raise ValueError(f"Unsupported STT provider: {stt_provider}")
    
    async def _connect_googlecloud_stt(self, on_transcript: Callable[[str], Awaitable[None]]) -> AsyncGenerator[None, None]:
        """Connect to Google Cloud STT WebSocket."""
        ws_endpoint = f"{self.ws_url}/api/stt/googlecloud"
        
        try:
            # Add ping/pong for keepalive to prevent timeout
            async with websockets.connect(
                ws_endpoint,
                ping_interval=20,  # Send ping every 20 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
                close_timeout=10
            ) as ws:
                self.stt_websocket = ws
                logger.info("Connected to Google Cloud STT WebSocket")
                
                # Task to receive transcripts
                async def receive_transcripts():
                    try:
                        logger.info("Started listening for transcripts from STT...")
                        async for message in ws:
                            try:
                                logger.debug(f"Received message from STT: {message[:100]}...")
                                data = json.loads(message)
                                if data.get("type") == "transcript":
                                    transcript = data.get("text", "").strip()
                                    if transcript:
                                        logger.info(f"Received transcript from STT: '{transcript}'")
                                        # on_transcript is async, so we need to await it
                                        await on_transcript(transcript)
                                    else:
                                        logger.debug("Received empty transcript, ignoring")
                                else:
                                    logger.debug(f"Received non-transcript message: {data.get('type')}")
                            except json.JSONDecodeError as e:
                                logger.warning(f"Invalid JSON from STT: {message[:100]}... Error: {e}")
                            except Exception as e:
                                logger.error(f"Error processing transcript: {e}", exc_info=True)
                    except websockets.exceptions.ConnectionClosed as e:
                        logger.info(f"STT WebSocket closed: {e}")
                    except Exception as e:
                        logger.error(f"Error receiving transcripts: {e}", exc_info=True)
                
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
    
    async def _connect_deepgram_stt(self, on_transcript: Callable[[str], Awaitable[None]]) -> AsyncGenerator[None, None]:
        """Connect to Deepgram STT WebSocket."""
        ws_endpoint = f"{self.ws_url}/api/stt/deepgram"
        
        try:
            # Add ping/pong for keepalive to prevent timeout
            async with websockets.connect(
                ws_endpoint,
                ping_interval=20,  # Send ping every 20 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
                close_timeout=10
            ) as ws:
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
                                        logger.info(f"Received transcript from STT: '{transcript}'")
                                        # on_transcript is async, so we need to await it
                                        await on_transcript(transcript)
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
            audio_data: Audio data as bytes (Int16 PCM, 16kHz)
        """
        if not self.stt_websocket:
            logger.warning("STT WebSocket not connected")
            return
        
        try:
            await self.stt_websocket.send(audio_data)
        except Exception as e:
            logger.error(f"Failed to send audio chunk: {e}", exc_info=True)
            raise
    
    async def chat(self, messages: list[ChatMessage], model: Optional[str] = None) -> str:
        """
        Send chat request and get response (non-streaming).
        
        Args:
            messages: List of chat messages
            model: Optional model override (default from config)
        
        Returns:
            Assistant response text
        """
        if not model:
            model = await config.get_chat_model()
        
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
    
    async def chat_stream(self, messages: list[ChatMessage], model: Optional[str] = None) -> AsyncGenerator[str, None]:
        """
        Stream chat response as text chunks arrive (SSE).
        
        Args:
            messages: List of chat messages
            model: Optional model override (default from config)
        
        Yields:
            Text chunks as they arrive from the streaming API
        """
        if not model:
            model = await config.get_chat_model()
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    'POST',
                    f"{self.backend_url}/api/chat/stream",
                    json={
                        "messages": [
                            {"role": msg.role, "content": msg.content}
                            for msg in messages
                        ],
                        "model": model
                    }
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        raise httpx.HTTPStatusError(
                            f"HTTP {response.status_code}: {error_text.decode()[:200]}",
                            request=response.request,
                            response=response
                        )
                    
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        
                        # SSE format: "data: {...}"
                        if line.startswith("data: "):
                            data_str = line[6:]  # Remove "data: " prefix
                            
                            # Check for [DONE] marker
                            if data_str.strip() == "[DONE]":
                                break
                            
                            try:
                                data = json.loads(data_str)
                                
                                # Check for error
                                if "error" in data:
                                    raise Exception(f"Streaming error: {data['error']}")
                                
                                # Get delta content
                                delta = data.get("delta", "")
                                if delta:
                                    yield delta
                                
                                # Check if done
                                if data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                # Skip invalid JSON lines
                                logger.warning(f"Invalid JSON in SSE stream: {data_str[:100]}")
                                continue
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            logger.warning(f"Streaming chat connection error: {e}, will fallback to non-streaming")
            raise
        except httpx.HTTPStatusError as e:
            logger.warning(f"Streaming chat HTTP error: {e}, will fallback to non-streaming")
            raise
        except Exception as e:
            logger.warning(f"Streaming chat error: {e}, will fallback to non-streaming")
            raise
    
    async def tts(self, text: str, voice: str = "nova", provider: Optional[str] = None) -> bytes:
        """
        Generate speech from text (non-streaming).
        
        Args:
            text: Text to convert to speech
            voice: Voice name (for OpenAI TTS)
            provider: Optional TTS provider override (default from config)
        
        Returns:
            Audio data as bytes (MP3 format)
        """
        if not provider:
            provider = await config.get_tts_provider()
        logger.info(f"Requesting TTS for text: '{text[:50]}...' (provider: {provider}, voice: {voice})")
        
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
                audio_data = response.content
                logger.info(f"Received TTS audio: {len(audio_data)} bytes")
                return audio_data
            except httpx.HTTPError as e:
                logger.error(f"TTS API error: {e}", exc_info=True)
                raise
            except Exception as e:
                logger.error(f"Unexpected error in TTS: {e}", exc_info=True)
                raise
    
    async def connect_tts_stream(self) -> None:
        """
        Connect to Deepgram TTS WebSocket for streaming TTS.
        Must be called before using send_tts_text and receive_tts_audio.
        """
        tts_provider = await config.get_tts_provider()
        if tts_provider != "deepgram":
            raise ValueError(f"Streaming TTS only supports 'deepgram' provider, got '{tts_provider}'")
        
        ws_endpoint = f"{self.ws_url}/api/tts/deepgram"
        
        try:
            self.tts_websocket = await websockets.connect(
                ws_endpoint,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=10
            )
            logger.info("Connected to Deepgram TTS WebSocket")
        except (websockets.exceptions.InvalidURI, websockets.exceptions.InvalidHandshake) as e:
            logger.error(f"Failed to connect to TTS WebSocket: {e}")
            raise
        except OSError as e:
            logger.error(f"Network error connecting to TTS WebSocket: {e}")
            raise
        except asyncio.TimeoutError as e:
            logger.error(f"Timeout connecting to TTS WebSocket: {e}")
            raise
    
    async def send_tts_text(self, text: str) -> None:
        """
        Send text chunk to TTS WebSocket for synthesis.
        
        Args:
            text: Text to synthesize
        """
        if not self.tts_websocket:
            raise RuntimeError("TTS WebSocket not connected. Call connect_tts_stream() first.")
        
        try:
            await self.tts_websocket.send(json.dumps({
                "type": "speak",
                "text": text
            }))
        except websockets.exceptions.ConnectionClosed:
            logger.warning("TTS WebSocket closed unexpectedly")
            raise
        except Exception as e:
            logger.error(f"Error sending text to TTS: {e}")
            raise
    
    async def receive_tts_audio(self) -> AsyncGenerator[bytes, None]:
        """
        Receive audio chunks from TTS WebSocket.
        Continues until PlaybackFinished message or connection closes.
        
        Yields:
            PCM audio chunks as bytes (Int16, 48kHz by default)
        """
        if not self.tts_websocket:
            raise RuntimeError("TTS WebSocket not connected. Call connect_tts_stream() first.")
        
        try:
            async for message in self.tts_websocket:
                if isinstance(message, bytes):
                    # PCM audio data
                    yield message
                elif isinstance(message, str):
                    # Control frame (JSON)
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type")
                        
                        if msg_type == "PlaybackFinished":
                            # TTS finished - stop receiving
                            logger.debug("TTS playback finished")
                            break
                        elif msg_type == "error":
                            # Error from Deepgram
                            error_msg = data.get("message", "Unknown error")
                            raise Exception(f"Deepgram TTS error: {error_msg}")
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON from TTS: {message}")
                        continue
        except websockets.exceptions.ConnectionClosed:
            logger.warning("TTS WebSocket closed during audio reception")
            raise
        except Exception as e:
            logger.error(f"Error receiving TTS audio: {e}")
            raise
    
    async def flush_tts(self) -> None:
        """
        Send flush command to TTS WebSocket to flush any pending text.
        """
        if not self.tts_websocket:
            raise RuntimeError("TTS WebSocket not connected")
        
        try:
            await self.tts_websocket.send(json.dumps({"type": "flush"}))
        except Exception as e:
            logger.error(f"Error flushing TTS: {e}")
            raise
    
    async def close_tts_stream(self) -> None:
        """Close TTS WebSocket connection."""
        if self.tts_websocket:
            try:
                await self.tts_websocket.close()
            except Exception as e:
                logger.error(f"Error closing TTS WebSocket: {e}")
            finally:
                self.tts_websocket = None
    
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
    
    async def get_top_memories(self, uid: str, limit: int = 10) -> List[dict]:
        """
        Get top memories for a user from backend.
        
        Args:
            uid: Firebase user ID
            limit: Number of top memories to fetch
        
        Returns:
            List of memory dicts with id, text, type, importance
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.backend_url}/api/users/{uid}/memories/top",
                    params={"limit": limit}
                )
                response.raise_for_status()
                data = response.json()
                return data.get("memories", [])
            except httpx.HTTPError as e:
                logger.error(f"Get top memories API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error getting top memories: {e}")
                raise
    
    async def save_memories(
        self,
        uid: str,
        memories: List[MemoryCandidate],
        user_name: Optional[str] = None
    ) -> dict:
        """
        Save memories for a user via backend.
        
        Args:
            uid: Firebase user ID
            memories: List of memory candidates to save
            user_name: Optional user name for crispifying
        
        Returns:
            Response dict with message and saved_count
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.backend_url}/api/users/{uid}/memories",
                    json={
                        "memories": [
                            {
                                "text": mem.text,
                                "type": mem.type,
                                "importance": mem.importance
                            }
                            for mem in memories
                        ],
                        "user_name": user_name
                    }
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error(f"Save memories API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error saving memories: {e}")
                raise
    
    async def start_conversation_session(
        self,
        uid: str,
        session_id: str,
        mode: str = "stt"
    ) -> dict:
        """
        Start a conversation session via backend.
        
        Args:
            uid: Firebase user ID
            session_id: Unique session ID
            mode: Conversation mode ('realtime' or 'stt')
        
        Returns:
            Response dict with message and session_id
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.backend_url}/api/users/{uid}/conversations/start",
                    json={
                        "session_id": session_id,
                        "mode": mode
                    }
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error(f"Start conversation API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error starting conversation: {e}")
                raise
    
    async def append_conversation_chunk(
        self,
        uid: str,
        session_id: str,
        messages: List[dict]
    ) -> dict:
        """
        Append messages to conversation via backend.
        
        Args:
            uid: Firebase user ID
            session_id: Session ID
            messages: List of message dicts with role, content, optional ts
        
        Returns:
            Response dict with session_id and was_split boolean
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.backend_url}/api/users/{uid}/conversations/{session_id}/append",
                    json={
                        "messages": messages
                    }
                )
                response.raise_for_status()
                data = response.json()
                # Backend returns snake_case, normalize to both formats for compatibility
                return {
                    "session_id": data.get("session_id"),
                    "sessionId": data.get("session_id"),  # For backward compatibility
                    "was_split": data.get("was_split", False),
                    "wasSplit": data.get("was_split", False)  # For backward compatibility
                }
            except httpx.HTTPError as e:
                logger.error(f"Append conversation API error: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error appending conversation: {e}")
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
        
        await self.close_tts_stream()

