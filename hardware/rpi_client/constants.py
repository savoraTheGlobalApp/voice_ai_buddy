"""
Constants for RPi Voice AI Buddy client.
All numeric values used throughout the codebase are defined here for easy tuning.
"""

# ============================================================================
# Memory Extraction
# ============================================================================
MEMORY_EXTRACT_EVERY_N = 5  # Extract memories every N user messages
MEMORY_EXTRACTION_TOP_K = 5  # Top K memories to extract
RECENT_MESSAGES_FOR_MEMORY = 20  # Number of recent messages to consider for memory extraction

# ============================================================================
# Speaking Flag Management
# ============================================================================
SPEAKING_COOLDOWN_MS = 200  # Cooldown period after TTS finishes (ms) (reduced from 300 for faster response)
SPEAKING_COOLDOWN_MAX_MS = 50  # Maximum cooldown (reduced from 100ms for fastest response)
# Watchdog thresholds - must be >= TTS_COMPLETION_TIMEOUT to prevent premature clearing
MAX_SPEAKING_DURATION = 95.0  # First check: verify hardware before clearing (seconds) - slightly above timeout
MAX_SPEAKING_DURATION_ABSOLUTE = 120.0  # Absolute max: clear even if hardware unclear (seconds) - last resort
SPEAKING_WATCHDOG_CHECK_INTERVAL = 2.0  # How often watchdog checks (seconds)

# ============================================================================
# TTS Connection
# ============================================================================
TTS_CONNECTION_STARTUP_DELAY = 0.5  # Wait time for TTS connection to establish (seconds)
TTS_CONNECTION_RECONNECT_DELAY = 2.0  # Delay before reconnecting TTS on error (seconds)

# ============================================================================
# Streaming TTS Text Chunking
# ============================================================================
TTS_TEXT_CHUNK_SIZE = 180  # Send text chunks every ~180 characters (about one sentence)

# ============================================================================
# TTS Completion Detection - Primary Hardware Detection (AGGRESSIVELY OPTIMIZED)
# ============================================================================
# Queue-based detection - aggressively reduced thresholds for fastest turn-around
QUEUE_SILENCE_THRESHOLD = 0.15  # Queue empty for this duration (seconds) (reduced from 0.3, was 0.5)
AUDIO_SILENCE_THRESHOLD = 0.1   # Audio silent for this duration (seconds) (reduced from 0.15, was 0.2)
HARDWARE_BUFFER_DELAY = 0.03    # Additional delay for hardware buffer drain (seconds) (reduced from 0.05, was 0.1)
MIN_PLAYBACK_DURATION = 0.2     # Minimum duration before considering completion (seconds) (reduced from 0.3)

# Detection check intervals
TTS_DETECTION_CHECK_INTERVAL = 0.02  # Check every 20ms for fastest response (reduced from 0.03s)
TTS_DETECTION_LOG_INTERVAL = 0.5    # Log detection state every 0.5s (seconds)

# ============================================================================
# TTS Completion Detection - Deepgram Confirmation (Secondary)
# ============================================================================
# Lower thresholds when Deepgram confirms completion (aggressively optimized)
DEEPGRAM_CONFIRMATION_QUEUE_THRESHOLD = 0.1   # Lower threshold since Deepgram confirmed (reduced from 0.3)
DEEPGRAM_CONFIRMATION_AUDIO_THRESHOLD = 0.05  # Lower audio threshold (reduced from 0.15)
DEEPGRAM_CONFIRMATION_BUFFER_DELAY = 0.02     # Lower buffer delay (reduced from 0.05)

# ============================================================================
# TTS Completion Detection - Timeout Fallback (Safety)
# ============================================================================
# Safety timeout - only clears flag if hardware detection confirms completion
TTS_COMPLETION_TIMEOUT = 90.0  # Safety timeout (seconds) - large value since hardware detection handles most cases
# If timeout fires, use these thresholds to verify completion (aggressively optimized)
TIMEOUT_VERIFICATION_QUEUE_THRESHOLD = 0.15  # Queue threshold for timeout verification (reduced from 0.3)
TIMEOUT_VERIFICATION_AUDIO_THRESHOLD = 0.1   # Audio threshold for timeout verification (reduced from 0.15)
TIMEOUT_VERIFICATION_BUFFER_DELAY = 0.03    # Buffer delay for timeout verification (reduced from 0.05)

# ============================================================================
# Audio Level Tracking (StreamingSpeaker)
# ============================================================================
AUDIO_LEVELS_MAX_SAMPLES = 30  # Keep last 30 samples (~3 seconds at 100ms intervals)
AUDIO_SILENCE_THRESHOLD_DB = -40.0  # Audio level threshold for silence (dB)
AUDIO_LEVEL_AVERAGE_WINDOW = 10  # Number of recent samples to average for level calculation

# ============================================================================
# StreamingSpeaker Thread Management
# ============================================================================
STREAMING_SPEAKER_QUEUE_TIMEOUT = 0.1  # Queue get timeout (seconds)
STREAMING_SPEAKER_STOP_TIMEOUT = 2.0  # Thread join timeout (seconds)

# ============================================================================
# Audio Logging Intervals
# ============================================================================
AUDIO_CHUNK_LOG_INTERVAL = 100  # Log every N chunks
SILENCE_CHUNK_LOG_INTERVAL = 100  # Log every N silence chunks

# ============================================================================
# Audio Feedback (Beep + Ambient Thinking Music)
# ============================================================================
FEEDBACK_BEEP_FREQUENCY = 880       # Hz (A5 note - pleasant, not harsh)
FEEDBACK_BEEP_DURATION = 0.1        # seconds (100ms)
FEEDBACK_BEEP_VOLUME = 0.3          # 0.0-1.0 (30% - audible but not jarring)
FEEDBACK_AMBIENT_DELAY = 0.3        # seconds before ambient music starts after beep
FEEDBACK_AMBIENT_CHUNK_MS = 100     # ms per ambient chunk queued to speaker
FEEDBACK_AMBIENT_VOLUME = 0.15      # 0.0-1.0 (15% - subtle background)

