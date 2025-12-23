"""
Main entry point for RPi Voice AI Buddy client.
Orchestrates audio capture, STT, TTT, TTS, and conversation management.
"""
import asyncio
import logging
import sys
from pathlib import Path
from typing import List, Optional

from .config import config
from .audio_handler import AudioHandler
from .api_client import APIClient, ChatMessage, MemoryCandidate
from .instruction_builder import build_socratic_tutor_instructions, UserMemory

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class VoiceAIBuddy:
    """Main Voice AI Buddy application."""
    
    def __init__(self):
        """Initialize Voice AI Buddy."""
        self.audio_handler: Optional[AudioHandler] = None
        self.api_client: Optional[APIClient] = None
        self.conversation_history: List[ChatMessage] = []
        self.conversation_session_id: Optional[str] = None
        self.last_saved_message_index = 0
        self.user_msg_counter = 0
        self.memory_extract_every_n = 5  # Extract memories every N user messages
        self.is_running = False
    
    async def initialize(self) -> None:
        """Initialize all components."""
        logger.info("Initializing Voice AI Buddy...")
        
        # Validate local configuration
        errors = config.validate()
        if errors:
            logger.error("Configuration errors:")
            for error in errors:
                logger.error(f"  - {error}")
            raise ValueError("Configuration validation failed")
        
        # Initialize API client (needed for fetching remote config)
        self.api_client = APIClient()
        
        # Fetch remote configuration from backend (OTA-updatable settings)
        logger.info("Fetching remote configuration from backend...")
        config_fetched = await config.fetch_remote_config(self.api_client)
        if not config_fetched:
            logger.warning("Using fallback defaults for remote configuration")
        
        # Validate remote configuration
        remote_errors = await config.validate_remote_config()
        if remote_errors:
            logger.warning("Remote configuration validation warnings:")
            for error in remote_errors:
                logger.warning(f"  - {error}")
        
        # Get remote config values for initialization
        sample_rate = await config.get_sample_rate()
        chunk_size = await config.get_chunk_size()
        
        # Initialize audio handler with remote config
        self.audio_handler = AudioHandler(
            sample_rate=sample_rate,
            chunk_size=chunk_size,
            input_device=config.AUDIO_INPUT_DEVICE,
            output_device=config.AUDIO_OUTPUT_DEVICE
        )
        
        # List available devices
        devices = self.audio_handler.list_devices()
        logger.info(f"Found {len(devices)} audio devices")
        
        # Fetch user memories from backend
        memories: List[UserMemory] = []
        if config.USER_UID and self.api_client:
            try:
                top_memories_count = await config.get_top_memories_count()
                memory_dicts = await self.api_client.get_top_memories(
                    config.USER_UID,
                    top_memories_count
                )
                memories = [
                    UserMemory(
                        id=mem.get("id"),
                        text=mem.get("text", ""),
                        type=mem.get("type", "facts"),
                        importance=mem.get("importance", 3)
                    )
                    for mem in memory_dicts
                ]
                logger.info(f"Loaded {len(memories)} user memories from backend")
            except Exception as e:
                logger.warning(f"Failed to fetch memories from backend: {e}")
        
        # Build instructions
        top_memories_count = await config.get_top_memories_count()
        instructions = build_socratic_tutor_instructions(
            user_name=config.USER_NAME,
            user_age=config.USER_AGE,
            top_memories=memories,
            top_memories_count=top_memories_count
        )
        
        # Initialize conversation history
        self.conversation_history = [
            ChatMessage(role="system", content=instructions)
        ]
        
        # Start conversation session via backend
        if config.USER_UID and self.api_client:
            import time
            import random
            self.conversation_session_id = f"{int(time.time() * 1000)}-{random.randint(100000, 999999)}"
            try:
                await self.api_client.start_conversation_session(
                    config.USER_UID,
                    self.conversation_session_id,
                    "stt"
                )
                logger.info(f"Started conversation session: {self.conversation_session_id}")
            except Exception as e:
                logger.error(f"Failed to start conversation session: {e}")
        
        logger.info("Initialization complete")
    
    async def run(self) -> None:
        """Run the main conversation loop."""
        if not self.audio_handler or not self.api_client:
            raise RuntimeError("Not initialized. Call initialize() first.")
        
        self.is_running = True
        logger.info("Starting Voice AI Buddy...")
        
        try:
            # Connect to STT WebSocket
            async for _ in self.api_client.connect_stt(self._on_transcript):
                # Start recording audio
                logger.info("Starting audio recording...")
                
                # Create async generator for audio chunks
                async def audio_stream():
                    """Stream audio chunks to STT."""
                    chunk_count = 0
                    bytes_sent = 0
                    try:
                        logger.info("Audio stream started, reading chunks...")
                        logger.info(f"Recording at {self.audio_handler.sample_rate}Hz, will resample to 16kHz for STT")
                        
                        # Import resampling function
                        from .audio_handler import resample_audio_to_16khz
                        
                        for chunk in self.audio_handler.start_recording():
                            if not self.is_running:
                                break
                            chunk_count += 1
                            
                            # Resample audio to 16kHz if needed (STT expects 16kHz)
                            if self.audio_handler.sample_rate != 16000:
                                chunk = resample_audio_to_16khz(chunk, self.audio_handler.sample_rate)
                            
                            bytes_sent += len(chunk)
                            if chunk_count % 100 == 0:  # Log every 100 chunks
                                logger.info(f"Sent {chunk_count} audio chunks ({bytes_sent} bytes) to STT")
                            
                            await self.api_client.send_audio_chunk(chunk)
                            await asyncio.sleep(0)  # Yield control
                    except Exception as e:
                        logger.error(f"Error in audio stream: {e}", exc_info=True)
                    finally:
                        logger.info(f"Audio stream ended. Total: {chunk_count} chunks, {bytes_sent} bytes sent")
                
                # Run audio streaming
                audio_task = asyncio.create_task(audio_stream())
                
                try:
                    # Wait for audio task (will run until stopped)
                    await audio_task
                except asyncio.CancelledError:
                    logger.info("Audio streaming cancelled")
                finally:
                    self.audio_handler.stop_recording()
        
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            raise
        finally:
            self.is_running = False
            await self.cleanup()
    
    async def _on_transcript(self, transcript: str) -> None:
        """
        Handle transcript from STT with streaming TTT and TTS with fallback.
        
        Args:
            transcript: Transcribed text
        """
        if not transcript:
            logger.debug("Received empty transcript, ignoring")
            return
        
        logger.info(f"User said: '{transcript}'")
        
        # Add to conversation history
        user_message = ChatMessage(role="user", content=transcript)
        self.conversation_history.append(user_message)
        self.user_msg_counter += 1
        
        # Try streaming first if enabled, fallback to non-streaming on error
        use_streaming = config.ENABLE_STREAMING_TTT and config.ENABLE_STREAMING_TTS
        
        if use_streaming:
            try:
                await self._process_response_streaming()
            except Exception as streaming_error:
                logger.warning(f"Streaming failed: {streaming_error}")
                if config.STREAMING_FALLBACK_ENABLED:
                    logger.info("Falling back to non-streaming...")
                    try:
                        await self._process_response_non_streaming()
                    except Exception as fallback_error:
                        logger.error(f"Non-streaming fallback also failed: {fallback_error}", exc_info=True)
                else:
                    logger.error("Streaming failed and fallback disabled", exc_info=True)
                    raise
        else:
            # Streaming disabled, use non-streaming directly
            await self._process_response_non_streaming()
        
        # Extract memories periodically
        if self.user_msg_counter % self.memory_extract_every_n == 0:
            logger.info("Extracting memories...")
            await self._extract_and_save_memories()
        
        # Save conversation to Firebase
        logger.debug("Saving conversation chunk...")
        await self._save_conversation_chunk()
        logger.info("Transcript processing complete")
    
    async def _process_response_streaming(self) -> None:
        """
        Process AI response using streaming TTT and streaming TTS.
        Falls back to non-streaming if any step fails.
        """
        logger.info("Processing response with streaming...")
        
        # Get TTS provider to check if streaming is supported
        tts_provider = await config.get_tts_provider()
        if tts_provider != "deepgram":
            raise ValueError(f"Streaming TTS requires 'deepgram' provider, got '{tts_provider}'")
        
        # Step 1: Try streaming chat
        response_text = ""
        text_buffer = ""
        MIN_CHUNK_SIZE = 20  # Minimum chars before sending to TTS
        SEND_CHUNK_SIZE = config.STREAMING_TTS_CHUNK_SIZE  # Send chunk to TTS every N chars
        
        try:
            # Connect to TTS WebSocket first
            await self.api_client.connect_tts_stream()
            
            # Start streaming audio playback
            self.audio_handler.start_streaming_playback(sample_rate=48000, channels=1)
            
            # Stream chat response and feed to TTS
            tts_failed = False
            remaining_text = ""
            audio_reception_task = None
            
            try:
                # Start audio reception task (runs concurrently)
                async def receive_audio_continuously():
                    """Continuously receive and play audio chunks."""
                    nonlocal tts_failed
                    try:
                        async for audio_chunk in self.api_client.receive_tts_audio():
                            self.audio_handler.play_audio_chunk(audio_chunk)
                    except Exception as audio_error:
                        logger.warning(f"TTS audio reception error: {audio_error}")
                        tts_failed = True
                
                audio_reception_task = asyncio.create_task(receive_audio_continuously())
                
                # Stream chat and send text to TTS
                async for text_chunk in self.api_client.chat_stream(self.conversation_history):
                    response_text += text_chunk
                    text_buffer += text_chunk
                    
                    # Send to TTS when buffer reaches threshold
                    if len(text_buffer) >= SEND_CHUNK_SIZE:
                        try:
                            await self.api_client.send_tts_text(text_buffer)
                            text_buffer = ""
                        except Exception as tts_send_error:
                            logger.warning(f"TTS send error: {tts_send_error}, will buffer remaining text")
                            tts_failed = True
                            remaining_text = response_text
                            break
                
                # Send any remaining buffered text
                if text_buffer and not tts_failed:
                    try:
                        await self.api_client.send_tts_text(text_buffer)
                        text_buffer = ""
                    except Exception as e:
                        logger.warning(f"Error sending final TTS chunk: {e}")
                        if not tts_failed:
                            remaining_text = response_text
                            tts_failed = True
                
                # Flush TTS to ensure all text is processed
                if not tts_failed:
                    try:
                        await self.api_client.flush_tts()
                    except Exception as e:
                        logger.warning(f"Error flushing TTS: {e}")
                
                # Wait for audio reception to complete (or timeout)
                # Note: receive_tts_audio will yield until PlaybackFinished or connection closes
                try:
                    # Wait for audio task with reasonable timeout
                    await asyncio.wait_for(audio_reception_task, timeout=60.0)
                except asyncio.TimeoutError:
                    logger.warning("Audio reception timeout - cancelling task")
                    audio_reception_task.cancel()
                    try:
                        await audio_reception_task
                    except asyncio.CancelledError:
                        pass
                    tts_failed = True
                    if not remaining_text:
                        remaining_text = response_text
                except Exception as e:
                    logger.warning(f"Audio reception task error: {e}")
                    if not audio_reception_task.done():
                        audio_reception_task.cancel()
                        try:
                            await audio_reception_task
                        except asyncio.CancelledError:
                            pass
                    tts_failed = True
                    if not remaining_text:
                        remaining_text = response_text
                
                # If TTS failed mid-stream, use non-streaming for remaining text
                if tts_failed and remaining_text:
                    logger.info("Falling back to non-streaming TTS for remaining text")
                    await self.api_client.close_tts_stream()
                    self.audio_handler.stop_streaming_playback()
                    
                    # Get full response if we don't have it
                    if not response_text:
                        response_text = await self.api_client.chat(self.conversation_history)
                    
                    # Use non-streaming TTS
                    audio_data = await self.api_client.tts(remaining_text)
                    self.audio_handler.play_audio(audio_data, format="mp3")
                    return
                
            except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as chat_error:
                # Chat streaming failed - close TTS and fallback completely
                logger.warning(f"Streaming chat failed: {chat_error}")
                await self.api_client.close_tts_stream()
                self.audio_handler.stop_streaming_playback()
                raise  # Will trigger non-streaming fallback
            
            finally:
                # Cleanup streaming resources
                if audio_reception_task and not audio_reception_task.done():
                    audio_reception_task.cancel()
                    try:
                        await audio_reception_task
                    except asyncio.CancelledError:
                        pass
                try:
                    await self.api_client.close_tts_stream()
                except Exception:
                    pass
                try:
                    self.audio_handler.stop_streaming_playback()
                except Exception:
                    pass
            
            # If we got here, streaming worked
            if response_text:
                # We have the full response from streaming
                assistant_message = ChatMessage(role="assistant", content=response_text)
                self.conversation_history.append(assistant_message)
                logger.info(f"Streaming complete. AI response: '{response_text[:100]}...'")
            else:
                raise Exception("No response received from streaming chat")
                
        except (ValueError, RuntimeError) as e:
            # Configuration or connection errors - fallback
            logger.warning(f"Streaming setup error: {e}, falling back")
            raise
        except Exception as e:
            # Any other streaming error - fallback
            logger.warning(f"Streaming error: {e}, falling back")
            raise
    
    async def _process_response_non_streaming(self) -> None:
        """
        Process AI response using non-streaming TTT and TTS (fallback).
        """
        logger.info("Processing response with non-streaming (fallback)...")
        
        # Get AI response
        response_text = await self.api_client.chat(self.conversation_history)
        logger.info(f"AI response: '{response_text}'")
        
        # Add AI response to conversation history
        assistant_message = ChatMessage(role="assistant", content=response_text)
        self.conversation_history.append(assistant_message)
        
        # Generate and play TTS
        try:
            logger.info("Generating TTS audio...")
            audio_data = await self.api_client.tts(response_text)
            logger.info(f"Playing TTS audio ({len(audio_data)} bytes)...")
            self.audio_handler.play_audio(audio_data, format="mp3")
            logger.info("TTS playback complete")
        except Exception as e:
            logger.error(f"Failed to play TTS: {e}", exc_info=True)
            raise
    
    async def _extract_and_save_memories(self) -> None:
        """Extract and save memories from conversation via backend."""
        if not config.USER_UID or not self.api_client:
            return
        
        try:
            # Get recent messages (exclude system message)
            recent_messages = [
                ChatMessage(role=msg.role, content=msg.content)
                for msg in self.conversation_history[-20:]  # Last 20 messages
                if msg.role != "system"
            ]
            
            if not recent_messages:
                return
            
            # Fetch existing memories from backend
            memory_limit = await config.get_memory_limit()
            existing_memories = await self.api_client.get_top_memories(
                config.USER_UID,
                memory_limit
            )
            existing_texts = [m.get("text", "") for m in existing_memories]
            
            # Extract memories using backend API
            memories = await self.api_client.extract_memories(
                messages=recent_messages,
                top_k=5,
                existing_memories=existing_texts
            )
            
            if memories:
                # Save memories via backend API
                # Backend will handle crispifying and use its own MEMORY_LIMIT
                await self.api_client.save_memories(
                    config.USER_UID,
                    memories,
                    config.USER_NAME
                )
                logger.info(f"Extracted and saved {len(memories)} memories via backend")
        
        except Exception as e:
            logger.error(f"Failed to extract/save memories: {e}")
    
    async def _save_conversation_chunk(self) -> None:
        """Save conversation chunk via backend."""
        if not config.USER_UID or not self.conversation_session_id or not self.api_client:
            return
        
        try:
            # Get new messages since last save
            new_messages = self.conversation_history[self.last_saved_message_index:]
            # Exclude system messages
            new_messages = [msg for msg in new_messages if msg.role != "system"]
            
            if not new_messages:
                return
            
            # Convert to dict format for backend API
            import time
            message_dicts = [
                {
                    "role": msg.role,
                    "content": msg.content,
                    "ts": time.time()
                }
                for msg in new_messages
            ]
            
            # Append to conversation via backend API
            result = await self.api_client.append_conversation_chunk(
                config.USER_UID,
                self.conversation_session_id,
                message_dicts
            )
            
            # Update session ID if document was split
            # Backend returns snake_case (was_split, session_id)
            if result.get("was_split") or result.get("wasSplit"):
                self.conversation_session_id = result.get("session_id") or result.get("sessionId")
                logger.info(f"Conversation session split, continuing in: {self.conversation_session_id}")
            
            self.last_saved_message_index = len(self.conversation_history)
            logger.debug(f"Saved {len(new_messages)} messages to conversation via backend")
        
        except Exception as e:
            logger.error(f"Failed to save conversation chunk: {e}")
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        logger.info("Cleaning up...")
        
        if self.audio_handler:
            self.audio_handler.close()
        
        if self.api_client:
            await self.api_client.close()
        
        # Save final conversation chunk
        await self._save_conversation_chunk()
        
        logger.info("Cleanup complete")


async def main():
    """Main entry point."""
    app = VoiceAIBuddy()
    
    try:
        await app.initialize()
        await app.run()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
    finally:
        await app.cleanup()


if __name__ == "__main__":
    asyncio.run(main())

