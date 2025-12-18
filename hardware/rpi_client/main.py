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
        
        # Validate configuration
        errors = config.validate()
        if errors:
            logger.error("Configuration errors:")
            for error in errors:
                logger.error(f"  - {error}")
            raise ValueError("Configuration validation failed")
        
        # Initialize audio handler
        self.audio_handler = AudioHandler(
            sample_rate=config.SAMPLE_RATE,
            chunk_size=config.CHUNK_SIZE,
            input_device=config.AUDIO_INPUT_DEVICE,
            output_device=config.AUDIO_OUTPUT_DEVICE
        )
        
        # List available devices
        devices = self.audio_handler.list_devices()
        logger.info(f"Found {len(devices)} audio devices")
        
        # Initialize API client
        self.api_client = APIClient()
        
        # Fetch user memories from backend
        memories: List[UserMemory] = []
        if config.USER_UID and self.api_client:
            try:
                memory_dicts = await self.api_client.get_top_memories(
                    config.USER_UID,
                    config.TOP_MEMORIES_COUNT
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
        instructions = build_socratic_tutor_instructions(
            user_name=config.USER_NAME,
            user_age=config.USER_AGE,
            top_memories=memories,
            top_memories_count=config.TOP_MEMORIES_COUNT
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
                    try:
                        for chunk in self.audio_handler.start_recording():
                            if not self.is_running:
                                break
                            await self.api_client.send_audio_chunk(chunk)
                            await asyncio.sleep(0)  # Yield control
                    except Exception as e:
                        logger.error(f"Error in audio stream: {e}")
                
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
            return
        
        logger.info(f"User said: {transcript}")
        
        # Add to conversation history
        user_message = ChatMessage(role="user", content=transcript)
        self.conversation_history.append(user_message)
        self.user_msg_counter += 1
        
        # Get AI response
        try:
            response_text = await self.api_client.chat(self.conversation_history)
            logger.info(f"AI response: {response_text}")
            
            # Add AI response to conversation history
            assistant_message = ChatMessage(role="assistant", content=response_text)
            self.conversation_history.append(assistant_message)
            
            # Generate and play TTS
            try:
                audio_data = await self.api_client.tts(response_text)
                self.audio_handler.play_audio(audio_data, format="mp3")
            except Exception as e:
                logger.error(f"Failed to play TTS: {e}")
            
            # Extract memories periodically
            if self.user_msg_counter % self.memory_extract_every_n == 0:
                await self._extract_and_save_memories()
            
            # Save conversation to Firebase
            await self._save_conversation_chunk()
        
        except Exception as e:
            logger.error(f"Error processing transcript: {e}")
    
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
            existing_memories = await self.api_client.get_top_memories(
                config.USER_UID,
                config.MEMORY_LIMIT
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
                # Backend will handle crispifying
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
            if result.get("wasSplit"):
                self.conversation_session_id = result["sessionId"]
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

