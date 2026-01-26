"""
Main entry point for RPi Voice AI Buddy client.
Orchestrates audio capture, STT, TTT, TTS, and conversation management.
"""
import asyncio
import logging
import sys
import threading
from pathlib import Path
from typing import List, Optional

from .config import config
from .audio_handler import AudioHandler
from .api_client import APIClient, ChatMessage, MemoryCandidate
from .instruction_builder import (
    build_socratic_tutor_instructions,
    build_greeting_prompt,
    UserMemory
)
from .greeting_prompts import GreetingSelector
from .constants import (
    MEMORY_EXTRACT_EVERY_N,
    MEMORY_EXTRACTION_TOP_K,
    RECENT_MESSAGES_FOR_MEMORY,
    SPEAKING_COOLDOWN_MS,
    SPEAKING_COOLDOWN_MAX_MS,
    MAX_SPEAKING_DURATION,
    SPEAKING_WATCHDOG_CHECK_INTERVAL,
    TTS_CONNECTION_STARTUP_DELAY,
    TTS_CONNECTION_RECONNECT_DELAY,
    TTS_TEXT_CHUNK_SIZE,
    QUEUE_SILENCE_THRESHOLD,
    AUDIO_SILENCE_THRESHOLD,
    HARDWARE_BUFFER_DELAY,
    MIN_PLAYBACK_DURATION,
    TTS_DETECTION_CHECK_INTERVAL,
    TTS_DETECTION_LOG_INTERVAL,
    DEEPGRAM_CONFIRMATION_QUEUE_THRESHOLD,
    DEEPGRAM_CONFIRMATION_AUDIO_THRESHOLD,
    DEEPGRAM_CONFIRMATION_BUFFER_DELAY,
    TTS_COMPLETION_TIMEOUT,
    TIMEOUT_VERIFICATION_QUEUE_THRESHOLD,
    TIMEOUT_VERIFICATION_AUDIO_THRESHOLD,
    TIMEOUT_VERIFICATION_BUFFER_DELAY,
    MAX_SPEAKING_DURATION,
    MAX_SPEAKING_DURATION_ABSOLUTE,
    AUDIO_CHUNK_LOG_INTERVAL,
    SILENCE_CHUNK_LOG_INTERVAL,
)

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
        self.memory_extract_every_n = MEMORY_EXTRACT_EVERY_N
        self.is_running = False
        self.use_streaming = False  # Will be set based on TTS provider
        self.streaming_speaker = None  # StreamingSpeaker instance for Deepgram TTS
        self._tts_connection_task: Optional[asyncio.Task] = None  # Task for persistent TTS connection
        self._speaking_watchdog_task: Optional[asyncio.Task] = None  # Watchdog to ensure flag doesn't stay set
        self._tts_finished_event: Optional[asyncio.Event] = None  # Event for Deepgram PlaybackFinished message
        self._greeting_sent = False  # Flag to track if initial greeting has been sent
        
        # Speaking state management (thread-safe)
        self.speaking = threading.Event()  # Set when TTS is active, cleared when finished
        self.speaking_cooldown_ms = SPEAKING_COOLDOWN_MS

        # Greeting system (hardcoded prompts for instant, varied greetings)
        # Tracks last 15 greetings to ensure no repetition
        self.greeting_selector = GreetingSelector(max_recent=15)

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
        
        # Start persistent TTS connection if using streaming
        if self.use_streaming:
            self._start_persistent_tts_connection()
            # Wait a bit for connection to establish
            await asyncio.sleep(TTS_CONNECTION_STARTUP_DELAY)
        
        # Start speaking flag watchdog
        self._start_speaking_watchdog()
        
        # Send initial greeting before starting STT listening
        await self._send_initial_greeting()
        
        try:
            # Connect to STT WebSocket
            async for _ in self.api_client.connect_stt(self._on_transcript):
                # Start recording audio
                logger.info("Starting audio recording...")
                
                # Create async generator for audio chunks
                async def audio_stream():
                    """Stream audio chunks to STT, sending silence when TTS is active."""
                    chunk_count = 0
                    bytes_sent = 0
                    silence_chunks_sent = 0
                    try:
                        logger.info("Audio stream started, reading chunks...")
                        logger.info(f"Recording at {self.audio_handler.sample_rate}Hz, will resample to 16kHz for STT")
                        
                        # Import resampling function and silence generator
                        from .audio_handler import resample_audio_to_16khz, generate_silence_chunk
                        
                        # Generate silence chunk for STT keepalive (16kHz, Int16 PCM)
                        silence_chunk = generate_silence_chunk(
                            chunk_size=self.audio_handler.chunk_size,
                            sample_rate=16000
                        )
                        
                        for chunk in self.audio_handler.start_recording():
                            if not self.is_running:
                                break
                            chunk_count += 1
                            
                            # Check if TTS is speaking - send silence instead of real audio
                            if self.speaking.is_set():
                                # Send silence chunk to keep STT connection alive
                                await self.api_client.send_audio_chunk(silence_chunk)
                                silence_chunks_sent += 1
                                if silence_chunks_sent % SILENCE_CHUNK_LOG_INTERVAL == 0:
                                    logger.debug(f"Sent {silence_chunks_sent} silence chunks (TTS active, speaking flag is set)")
                            else:
                                # Resample audio to 16kHz if needed (STT expects 16kHz)
                                if self.audio_handler.sample_rate != 16000:
                                    chunk = resample_audio_to_16khz(chunk, self.audio_handler.sample_rate)
                                
                                bytes_sent += len(chunk)
                                if chunk_count % AUDIO_CHUNK_LOG_INTERVAL == 0:
                                    logger.info(f"Sent {chunk_count} audio chunks ({bytes_sent} bytes) to STT (speaking flag is clear)")
                                
                                await self.api_client.send_audio_chunk(chunk)
                            
                            await asyncio.sleep(0)  # Yield control
                    except Exception as e:
                        logger.error(f"Error in audio stream: {e}", exc_info=True)
                    finally:
                        logger.info(f"Audio stream ended. Total: {chunk_count} chunks, {bytes_sent} bytes sent, {silence_chunks_sent} silence chunks")
                
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
    
    async def _send_initial_greeting(self) -> None:
        """
        Send initial greeting from AI before user starts speaking.
        Uses hardcoded age-appropriate greetings for instant, varied responses.
        """
        if self._greeting_sent:
            logger.debug("Initial greeting already sent, skipping")
            return

        logger.info("Selecting initial greeting...")

        try:
            # Get random age-appropriate greeting (instant, no LLM call)
            greeting_text = self.greeting_selector.get_greeting(
                user_name=config.USER_NAME,
                user_age=config.USER_AGE
            )

            logger.info(f"Selected greeting: '{greeting_text}'")

            # Add greeting to conversation history
            assistant_message = ChatMessage(role="assistant", content=greeting_text)
            self.conversation_history.append(assistant_message)

            # Speak greeting
            try:
                if self.use_streaming:
                    await self._speak_greeting_streaming(greeting_text)
                else:
                    await self._speak_greeting_non_streaming(greeting_text)
                self._greeting_sent = True
                logger.info("Initial greeting sent and spoken successfully")
            except Exception as e:
                logger.error(f"Failed to speak greeting: {e}", exc_info=True)
                raise

        except Exception as e:
            logger.error(f"Failed to generate/speak greeting: {e}", exc_info=True)
            # Use simple fallback greeting
            fallback_greeting = (
                f"Hi {config.USER_NAME}! I'm your learning buddy! What would you like to explore today?"
                if config.USER_NAME
                else "Hi! I'm your learning buddy! What would you like to explore today?"
            )

            # Add fallback greeting to history
            assistant_message = ChatMessage(role="assistant", content=fallback_greeting)
            self.conversation_history.append(assistant_message)

            # Speak fallback greeting
            try:
                if self.use_streaming:
                    await self._speak_greeting_streaming(fallback_greeting)
                else:
                    await self._speak_greeting_non_streaming(fallback_greeting)
                self._greeting_sent = True
                logger.info("Fallback greeting sent successfully")
            except Exception as e2:
                logger.error(f"Failed to speak fallback greeting: {e2}", exc_info=True)
                # Continue anyway - don't block startup
    
    async def _handle_streaming_greeting(self) -> None:
        """Handle streaming greeting generation and TTS."""
        logger.info("Getting AI greeting (streaming)...")
        
        # Buffer for accumulating response text
        response_text = ""
        text_buffer = ""
        tts_finished = asyncio.Event()
        self._tts_finished_event = tts_finished
        
        # Callback for streaming chat tokens
        async def on_chat_token(token: str) -> None:
            nonlocal response_text, text_buffer
            response_text += token
            text_buffer += token
            
            # Send text chunks to TTS when buffer is large enough
            if len(text_buffer) >= TTS_TEXT_CHUNK_SIZE:
                text_to_speak = text_buffer
                text_buffer = ""
                if text_to_speak.strip():
                    try:
                        await self.api_client.send_tts_text(text_to_speak)
                    except RuntimeError as e:
                        logger.error(f"Failed to send TTS text: {e}")
        
        # Stream chat response
        full_response = await self.api_client.chat_stream(
            self.conversation_history,
            on_token=on_chat_token
        )
        
        # Send any remaining buffered text
        if text_buffer.strip():
            try:
                await self.api_client.send_tts_text(text_buffer)
            except RuntimeError as e:
                logger.error(f"Failed to send remaining TTS text: {e}")
        
        # Flush TTS to finish current utterance
        try:
            await self.api_client.flush_tts()
        except RuntimeError as e:
            logger.error(f"Failed to flush TTS: {e}")
        
        logger.info(f"AI greeting (streaming): '{full_response}'")
        
        # Add AI response to conversation history
        assistant_message = ChatMessage(role="assistant", content=full_response)
        self.conversation_history.append(assistant_message)
        
        # Wait for TTS playback to finish
        await self._wait_for_tts_completion(tts_finished)
        self._tts_finished_event = None
    
    async def _handle_non_streaming_greeting(self) -> None:
        """Handle non-streaming greeting generation and TTS."""
        logger.info("Getting AI greeting (non-streaming)...")
        response_text = await self.api_client.chat(self.conversation_history)
        logger.info(f"AI greeting: '{response_text}'")
        
        # Add AI response to conversation history
        assistant_message = ChatMessage(role="assistant", content=response_text)
        self.conversation_history.append(assistant_message)
        
        # Speak the greeting
        await self._speak_greeting_non_streaming(response_text)
    
    async def _speak_greeting_streaming(self, text: str) -> None:
        """Speak greeting using streaming TTS."""
        try:
            await self.api_client.send_tts_text(text)
            await self.api_client.flush_tts()
            
            # Wait for TTS to complete
            tts_finished = asyncio.Event()
            self._tts_finished_event = tts_finished
            await self._wait_for_tts_completion(tts_finished)
            self._tts_finished_event = None
        except Exception as e:
            logger.error(f"Failed to speak greeting via streaming TTS: {e}", exc_info=True)
            raise
    
    async def _speak_greeting_non_streaming(self, text: str) -> None:
        """Speak greeting using non-streaming TTS."""
        try:
            logger.info("Generating TTS audio for greeting (non-streaming)...")
            audio_data = await self.api_client.tts(text)
            logger.info(f"Playing greeting TTS audio ({len(audio_data)} bytes)...")
            
            # Set speaking flag before TTS playback
            self.speaking.set()
            logger.info("Speaking flag set (greeting TTS started)")
            
            try:
                self.audio_handler.play_audio(audio_data, format="mp3")
                logger.info("Greeting TTS playback complete")
            finally:
                # Clear speaking flag after cooldown period
                await self._clear_speaking_after_cooldown()
        except Exception as e:
            logger.error(f"Failed to play greeting TTS: {e}", exc_info=True)
            # Ensure speaking flag is cleared even on error
            self.speaking.clear()
            raise
    
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
            
            # Set speaking flag before TTS playback
            self.speaking.set()
            logger.info("Speaking flag set (non-streaming TTS started)")
            
            try:
                self.audio_handler.play_audio(audio_data, format="mp3")
                logger.info("TTS playback complete")
            finally:
                # Clear speaking flag after cooldown period
                await self._clear_speaking_after_cooldown()
        except Exception as e:
            logger.error(f"Failed to play TTS: {e}", exc_info=True)
            # Ensure speaking flag is cleared even on error
            self.speaking.clear()
    
    def _start_persistent_tts_connection(self) -> None:
        """Start persistent TTS WebSocket connection."""
        if self._tts_connection_task and not self._tts_connection_task.done():
            logger.warning("TTS connection already started")
            return
        
        async def tts_connection_loop():
            """Maintain persistent TTS connection."""
            # Callback for audio chunks
            async def on_audio_chunk(audio_chunk: bytes) -> None:
                """Play audio chunk as it arrives."""
                if self.streaming_speaker:
                    self.streaming_speaker.play(audio_chunk)
                    # Set speaking flag on first audio chunk
                    if not self.speaking.is_set():
                        self.speaking.set()
                        logger.info("Speaking flag set (streaming TTS started - first audio chunk received)")
            
            # Callback for TTS finished (from Deepgram message)
            async def on_tts_finished() -> None:
                """Called when TTS playback finishes (from Deepgram message)."""
                # Set the event so _wait_for_tts_completion can check it
                # Hardware verification will be done in _wait_for_tts_completion
                logger.debug("Received PlaybackFinished message from Deepgram")
                if self._tts_finished_event:
                    self._tts_finished_event.set()
            
            try:
                # Keep connection alive indefinitely
                # The async generator yields continuously to keep connection open
                async for _ in self.api_client.connect_tts_deepgram(
                    on_audio_chunk=on_audio_chunk,
                    on_finished=on_tts_finished
                ):
                    # Just pass - the generator keeps yielding to maintain connection
                    if not self.is_running:
                        break
            except Exception as e:
                logger.error(f"TTS connection error: {e}", exc_info=True)
                # Try to reconnect after a delay
                await asyncio.sleep(TTS_CONNECTION_RECONNECT_DELAY)
                if self.is_running:
                    self._start_persistent_tts_connection()
        
        self._tts_connection_task = asyncio.create_task(tts_connection_loop())
        logger.info("Started persistent TTS connection")
    
    async def _handle_streaming_response(self) -> None:
        """Handle streaming chat and TTS response using persistent connection."""
        logger.info("Getting AI response (streaming)...")
        
        # Buffer for accumulating response text
        response_text = ""
        text_buffer = ""
        tts_finished = asyncio.Event()
        # Store event so Deepgram callback can set it
        self._tts_finished_event = tts_finished
        
        # Callback for streaming chat tokens
        async def on_chat_token(token: str) -> None:
            nonlocal response_text, text_buffer
            response_text += token
            text_buffer += token
            
            # Send text chunks to TTS when buffer is large enough
            if len(text_buffer) >= TTS_TEXT_CHUNK_SIZE:
                text_to_speak = text_buffer
                text_buffer = ""
                if text_to_speak.strip():
                    try:
                        await self.api_client.send_tts_text(text_to_speak)
                    except RuntimeError as e:
                        logger.error(f"Failed to send TTS text: {e}")
        
        # Stream chat response (this will call on_chat_token for each token)
        full_response = await self.api_client.chat_stream(
            self.conversation_history,
            on_token=on_chat_token
        )
        
        # Send any remaining buffered text
        if text_buffer.strip():
            try:
                await self.api_client.send_tts_text(text_buffer)
            except RuntimeError as e:
                logger.error(f"Failed to send remaining TTS text: {e}")
        
        # Flush TTS to finish current utterance
        try:
            await self.api_client.flush_tts()
        except RuntimeError as e:
            logger.error(f"Failed to flush TTS: {e}")
        
        logger.info(f"AI response (streaming): '{full_response}'")
        
        # Add AI response to conversation history
        assistant_message = ChatMessage(role="assistant", content=full_response)
        self.conversation_history.append(assistant_message)
        
        # Wait for TTS playback to finish using queue-based detection
        await self._wait_for_tts_completion(tts_finished)
        # Clear the stored event reference
        self._tts_finished_event = None
    
    async def _wait_for_tts_completion(self, tts_finished: asyncio.Event) -> None:
        """
        Wait for TTS playback to complete using multi-factor definitive detection.
        
        Detection methods (in priority order):
        1. Hardware detection (queue state + audio levels + stream state) - PRIMARY
        2. Deepgram "PlaybackFinished" message - CONFIRMATION
        3. Time-based timeout - SAFETY FALLBACK (only clears if hardware confirms completion)
        
        Args:
            tts_finished: Event that will be set when TTS finishes (from Deepgram message)
        """
        if not self.streaming_speaker:
            logger.warning("No streaming speaker available for completion detection")
            return
        
        start_time = asyncio.get_event_loop().time()
        playback_start_time = None
        last_log_time = start_time
        last_detection_state = None
        
        try:
            while True:
                current_time = asyncio.get_event_loop().time()
                elapsed = current_time - start_time
                
                # Track when playback actually started (first time queue is not empty)
                is_queue_empty = self.streaming_speaker.is_queue_empty()
                if not is_queue_empty and playback_start_time is None:
                    playback_start_time = current_time
                    logger.debug("TTS playback started (queue not empty, first audio chunk)")
                
                # Only check for completion if minimum playback duration has passed
                if playback_start_time is not None:
                    playback_duration = current_time - playback_start_time
                    
                    if playback_duration >= MIN_PLAYBACK_DURATION:
                        # PRIMARY: Hardware-based definitive detection
                        is_finished, detection_info = self.streaming_speaker.has_finished_playback(
                            queue_silence_threshold=QUEUE_SILENCE_THRESHOLD,
                            audio_silence_threshold=AUDIO_SILENCE_THRESHOLD,
                            hardware_buffer_delay=HARDWARE_BUFFER_DELAY
                        )
                        
                        # Log detection state periodically
                        if current_time - last_log_time >= TTS_DETECTION_LOG_INTERVAL:
                            detection_state = (
                                f"queue_empty={detection_info['queue_empty']}, "
                                f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                                f"audio_silent={detection_info['audio_silent']}, "
                                f"audio_silence_duration={detection_info['audio_silence_duration']:.2f}s, "
                                f"level_db={detection_info['current_level_db']:.1f}dB"
                            )
                            if detection_state != last_detection_state:
                                logger.debug(f"TTS detection state: {detection_state}")
                                last_detection_state = detection_state
                            last_log_time = current_time
                        
                        if is_finished:
                            logger.info(
                                f"TTS playback complete (hardware detection): "
                                f"queue_empty={detection_info['queue_empty_duration']:.2f}s, "
                                f"audio_silent={detection_info['audio_silence_duration']:.2f}s, "
                                f"level={detection_info['current_level_db']:.1f}dB"
                            )
                            await self._clear_speaking_after_cooldown()
                            return
                
                # SECONDARY: Deepgram "PlaybackFinished" message (confirmation)
                # Only clear flag if hardware detection confirms completion
                if tts_finished.is_set():
                    # Verify with hardware detection before clearing
                    if playback_start_time is not None:
                        is_finished, detection_info = self.streaming_speaker.has_finished_playback(
                            queue_silence_threshold=DEEPGRAM_CONFIRMATION_QUEUE_THRESHOLD,
                            audio_silence_threshold=DEEPGRAM_CONFIRMATION_AUDIO_THRESHOLD,
                            hardware_buffer_delay=DEEPGRAM_CONFIRMATION_BUFFER_DELAY
                        )
                        if is_finished:
                            # Hardware confirms completion - safe to clear
                            logger.info(
                                f"TTS playback complete (Deepgram message + hardware confirmation): "
                                f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                                f"audio_silence={detection_info['audio_silence_duration']:.2f}s"
                            )
                            await self._clear_speaking_after_cooldown()
                            return
                        else:
                            # Hardware indicates audio still playing - wait longer
                            logger.info(
                                "Deepgram sent PlaybackFinished, but hardware indicates audio still playing. "
                                f"Waiting longer. Detection state: queue_empty={detection_info['queue_empty']}, "
                                f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                                f"audio_silent={detection_info['audio_silent']}, "
                                f"level={detection_info['current_level_db']:.1f}dB"
                            )
                            # Continue waiting - don't clear flag yet
                            # Reset the event so we can check again in next iteration
                            tts_finished.clear()
                    else:
                        # Playback hasn't started yet - wait for it to start
                        logger.debug("Deepgram sent PlaybackFinished, but playback hasn't started yet. Waiting...")
                        tts_finished.clear()
                
                # FALLBACK: Time-based timeout (safety net)
                # Only clear flag if hardware detection confirms completion
                if elapsed >= TTS_COMPLETION_TIMEOUT:
                    # Verify with hardware detection before clearing
                    is_finished, detection_info = self.streaming_speaker.has_finished_playback(
                        queue_silence_threshold=TIMEOUT_VERIFICATION_QUEUE_THRESHOLD,
                        audio_silence_threshold=TIMEOUT_VERIFICATION_AUDIO_THRESHOLD,
                        hardware_buffer_delay=TIMEOUT_VERIFICATION_BUFFER_DELAY
                    )
                    
                    if is_finished:
                        # Hardware confirms completion - safe to clear
                        logger.warning(
                            f"TTS playback timeout after {TTS_COMPLETION_TIMEOUT}s, but hardware confirms completion. "
                            f"Clearing speaking flag. Detection state: queue_empty={detection_info['queue_empty']}, "
                            f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                            f"audio_silent={detection_info['audio_silent']}, "
                            f"level={detection_info['current_level_db']:.1f}dB"
                        )
                        await self._clear_speaking_after_cooldown()
                        return
                    else:
                        # Hardware indicates audio still playing - wait longer
                        logger.warning(
                            f"TTS playback timeout after {TTS_COMPLETION_TIMEOUT}s, but hardware indicates audio still playing. "
                            f"Waiting longer. Detection state: queue_empty={detection_info['queue_empty']}, "
                            f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                            f"audio_silent={detection_info['audio_silent']}, "
                            f"level={detection_info['current_level_db']:.1f}dB"
                        )
                        # Continue waiting - don't clear flag yet
                        # The watchdog will eventually clear it if it gets stuck
                
                await asyncio.sleep(TTS_DETECTION_CHECK_INTERVAL)
        except Exception as e:
            logger.error(f"Error waiting for TTS completion: {e}", exc_info=True)
            # Ensure speaking flag is cleared on error
            await self._clear_speaking_after_cooldown()
    
    def _start_speaking_watchdog(self) -> None:
        """
        Start watchdog to ensure speaking flag doesn't stay set indefinitely.
        
        The watchdog is conditional - it only clears the flag if:
        1. Hardware detection confirms completion (at MAX_SPEAKING_DURATION), OR
        2. It's been stuck for an absolute maximum time (MAX_SPEAKING_DURATION_ABSOLUTE) as last resort
        """
        if self._speaking_watchdog_task and not self._speaking_watchdog_task.done():
            return
        
        async def watchdog_loop():
            """Monitor speaking flag and clear if stuck, but only after verifying hardware."""
            
            speaking_start_time = None
            
            while self.is_running:
                try:
                    if self.speaking.is_set():
                        if speaking_start_time is None:
                            speaking_start_time = asyncio.get_event_loop().time()
                            logger.debug("Speaking flag watchdog: flag is set, starting timer")
                        else:
                            duration = asyncio.get_event_loop().time() - speaking_start_time
                            
                            # First threshold: Check hardware before clearing
                            if duration >= MAX_SPEAKING_DURATION:
                                if self.streaming_speaker:
                                    # Verify with hardware detection before clearing
                                    is_finished, detection_info = self.streaming_speaker.has_finished_playback(
                                        queue_silence_threshold=TIMEOUT_VERIFICATION_QUEUE_THRESHOLD,
                                        audio_silence_threshold=TIMEOUT_VERIFICATION_AUDIO_THRESHOLD,
                                        hardware_buffer_delay=TIMEOUT_VERIFICATION_BUFFER_DELAY
                                    )
                                    
                                    if is_finished:
                                        # Hardware confirms completion - safe to clear
                                        logger.warning(
                                            f"Speaking flag watchdog: flag has been set for {duration:.1f}s. "
                                            f"Hardware confirms completion. Clearing flag. "
                                            f"Detection state: queue_empty={detection_info['queue_empty']}, "
                                            f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                                            f"audio_silent={detection_info['audio_silent']}, "
                                            f"level={detection_info['current_level_db']:.1f}dB"
                                        )
                                        self.speaking.clear()
                                        speaking_start_time = None
                                    else:
                                        # Hardware indicates audio still playing - wait longer
                                        logger.warning(
                                            f"Speaking flag watchdog: flag has been set for {duration:.1f}s, "
                                            f"but hardware indicates audio still playing. Waiting longer. "
                                            f"Detection state: queue_empty={detection_info['queue_empty']}, "
                                            f"queue_duration={detection_info['queue_empty_duration']:.2f}s, "
                                            f"audio_silent={detection_info['audio_silent']}, "
                                            f"level={detection_info['current_level_db']:.1f}dB"
                                        )
                                        # Continue monitoring - don't clear yet
                                else:
                                    # No streaming speaker available - can't verify hardware
                                    # Only clear if we've exceeded absolute max
                                    if duration >= MAX_SPEAKING_DURATION_ABSOLUTE:
                                        logger.warning(
                                            f"Speaking flag watchdog: flag has been set for {duration:.1f}s "
                                            f"(absolute max: {MAX_SPEAKING_DURATION_ABSOLUTE}s). "
                                            "No streaming speaker available for verification. Clearing flag as last resort."
                                        )
                                        self.speaking.clear()
                                        speaking_start_time = None
                            
                            # Absolute maximum threshold: Clear even if hardware is unclear (last resort)
                            elif duration >= MAX_SPEAKING_DURATION_ABSOLUTE:
                                logger.error(
                                    f"Speaking flag watchdog: flag has been set for {duration:.1f}s "
                                    f"(absolute max: {MAX_SPEAKING_DURATION_ABSOLUTE}s). "
                                    "Clearing flag as last resort to prevent infinite blocking."
                                )
                                self.speaking.clear()
                                speaking_start_time = None
                    else:
                        if speaking_start_time is not None:
                            duration = asyncio.get_event_loop().time() - speaking_start_time
                            logger.debug(f"Speaking flag cleared after {duration:.1f}s")
                            speaking_start_time = None
                    
                    await asyncio.sleep(SPEAKING_WATCHDOG_CHECK_INTERVAL)
                except Exception as e:
                    logger.error(f"Error in speaking flag watchdog: {e}", exc_info=True)
                    await asyncio.sleep(SPEAKING_WATCHDOG_CHECK_INTERVAL)
        
        self._speaking_watchdog_task = asyncio.create_task(watchdog_loop())
        logger.debug("Started speaking flag watchdog")
    
    async def _clear_speaking_after_cooldown(self) -> None:
        """
        Clear speaking flag after cooldown period to prevent echo.
        This allows a brief delay after TTS finishes before accepting new input.
        
        Cooldown is reduced to 100-150ms for faster response while still preventing echo.
        """
        if not self.speaking.is_set():
            logger.debug("Speaking flag already cleared, skipping cooldown")
            return
        
        # Reduced cooldown for faster response
        cooldown_ms = min(self.speaking_cooldown_ms, SPEAKING_COOLDOWN_MAX_MS)
        logger.info(f"Starting speaking flag cooldown ({cooldown_ms}ms)...")
        await asyncio.sleep(cooldown_ms / 1000.0)
        self.speaking.clear()
        logger.info(f"Speaking flag cleared (cooldown: {cooldown_ms}ms) - ready for new input")
    
    async def _extract_and_save_memories(self) -> None:
        """Extract and save memories from conversation via backend."""
        if not config.USER_UID or not self.api_client:
            return
        
        try:
            # Get recent messages (exclude system message)
            recent_messages = [
                ChatMessage(role=msg.role, content=msg.content)
                for msg in self.conversation_history[-RECENT_MESSAGES_FOR_MEMORY:]
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
                top_k=MEMORY_EXTRACTION_TOP_K,
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
        
        # Stop speaking flag watchdog
        if self._speaking_watchdog_task:
            self._speaking_watchdog_task.cancel()
            try:
                await self._speaking_watchdog_task
            except asyncio.CancelledError:
                pass
            finally:
                self._speaking_watchdog_task = None
        
        # Stop persistent TTS connection
        if self._tts_connection_task:
            self._tts_connection_task.cancel()
            try:
                await self._tts_connection_task
            except asyncio.CancelledError:
                pass
            finally:
                self._tts_connection_task = None
        
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

