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
        self.use_streaming = False  # Will be set based on TTS provider
        self.streaming_speaker = None  # StreamingSpeaker instance for Deepgram TTS
    
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
        
        # Check if we should use streaming (when TTS provider is deepgram)
        tts_provider = await config.get_tts_provider()
        self.use_streaming = (tts_provider == "deepgram")
        logger.info(f"TTS provider: {tts_provider}, streaming mode: {self.use_streaming}")
        
        # Initialize audio handler with remote config
        self.audio_handler = AudioHandler(
            sample_rate=sample_rate,
            chunk_size=chunk_size,
            input_device=config.AUDIO_INPUT_DEVICE,
            output_device=config.AUDIO_OUTPUT_DEVICE
        )
        
        # Initialize streaming speaker if using streaming TTS
        if self.use_streaming:
            # Deepgram TTS uses 48kHz sample rate
            self.streaming_speaker = self.audio_handler.start_streaming_playback(sample_rate=48000)
            self.streaming_speaker.start()
            logger.info("Initialized streaming speaker for Deepgram TTS")
        
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
        Handle transcript from STT.
        
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
        
        # Get AI response
        try:
            if self.use_streaming:
                # Use streaming chat and TTS
                await self._handle_streaming_response()
            else:
                # Use non-streaming chat and TTS
                await self._handle_non_streaming_response()
            
            # Extract memories periodically
            if self.user_msg_counter % self.memory_extract_every_n == 0:
                logger.info("Extracting memories...")
                await self._extract_and_save_memories()
            
            # Save conversation to Firebase
            logger.debug("Saving conversation chunk...")
            await self._save_conversation_chunk()
            logger.info("Transcript processing complete")
        
        except Exception as e:
            logger.error(f"Error processing transcript: {e}", exc_info=True)
    
    async def _handle_non_streaming_response(self) -> None:
        """Handle non-streaming chat and TTS response."""
        logger.info("Getting AI response (non-streaming)...")
        response_text = await self.api_client.chat(self.conversation_history)
        logger.info(f"AI response: '{response_text}'")
        
        # Add AI response to conversation history
        assistant_message = ChatMessage(role="assistant", content=response_text)
        self.conversation_history.append(assistant_message)
        
        # Generate and play TTS
        try:
            logger.info("Generating TTS audio (non-streaming)...")
            audio_data = await self.api_client.tts(response_text)
            logger.info(f"Playing TTS audio ({len(audio_data)} bytes)...")
            self.audio_handler.play_audio(audio_data, format="mp3")
            logger.info("TTS playback complete")
        except Exception as e:
            logger.error(f"Failed to play TTS: {e}", exc_info=True)
    
    async def _handle_streaming_response(self) -> None:
        """Handle streaming chat and TTS response."""
        logger.info("Getting AI response (streaming)...")
        
        # Buffer for accumulating response text
        response_text = ""
        text_buffer = ""
        SEND_EVERY = 180  # Send text chunks every ~180 characters (about one sentence)
        tts_finished = asyncio.Event()
        send_text_func = None
        flush_func = None
        
        # Callback for audio chunks
        async def on_audio_chunk(audio_chunk: bytes) -> None:
            """Play audio chunk as it arrives."""
            if self.streaming_speaker:
                self.streaming_speaker.play(audio_chunk)
        
        # Callback for TTS finished
        async def on_tts_finished() -> None:
            """Called when TTS playback finishes."""
            tts_finished.set()
        
        # Callback for streaming chat tokens
        async def on_chat_token(token: str) -> None:
            nonlocal response_text, text_buffer, send_text_func
            response_text += token
            text_buffer += token
            
            # Send text chunks to TTS when buffer is large enough
            if send_text_func and len(text_buffer) >= SEND_EVERY:
                text_to_speak = text_buffer
                text_buffer = ""
                if text_to_speak.strip():
                    await send_text_func(text_to_speak)
        
        # Connect to streaming TTS using async generator
        async for tts_send, tts_flush in self.api_client.tts_stream_deepgram(
            on_audio_chunk=on_audio_chunk,
            on_finished=on_tts_finished
        ):
            send_text_func = tts_send
            flush_func = tts_flush
            
            # Stream chat response (this will call on_chat_token for each token)
            full_response = await self.api_client.chat_stream(
                self.conversation_history,
                on_token=on_chat_token
            )
            
            # Send any remaining buffered text
            if text_buffer.strip() and send_text_func:
                await send_text_func(text_buffer)
                text_buffer = ""
            
            # Flush TTS to finish current utterance
            if flush_func:
                await flush_func()
            
            logger.info(f"AI response (streaming): '{full_response}'")
            
            # Add AI response to conversation history
            assistant_message = ChatMessage(role="assistant", content=full_response)
            self.conversation_history.append(assistant_message)
            
            # Wait for TTS playback to finish
            try:
                await asyncio.wait_for(tts_finished.wait(), timeout=30.0)
                logger.info("TTS playback complete (streaming)")
            except asyncio.TimeoutError:
                logger.warning("TTS playback timeout")
            
            # Break after first iteration (async generator yields once)
            break
    
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
        
        # Stop streaming speaker if active
        if self.streaming_speaker:
            self.streaming_speaker.stop()
            self.streaming_speaker = None
        
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

