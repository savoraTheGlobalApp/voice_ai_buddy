"""
Audio handler for microphone input and speaker output using PyAudio.
Replaces browser audio APIs (getUserMedia, AudioContext) with PyAudio.
"""
import logging
import pyaudio
import wave
import io
import queue
import asyncio
from typing import Optional, Callable, Generator
from threading import Thread, Event

from .constants import (
    AUDIO_LEVELS_MAX_SAMPLES,
    AUDIO_SILENCE_THRESHOLD_DB,
    AUDIO_LEVEL_AVERAGE_WINDOW,
    STREAMING_SPEAKER_QUEUE_TIMEOUT,
    STREAMING_SPEAKER_STOP_TIMEOUT,
    QUEUE_SILENCE_THRESHOLD,
    AUDIO_SILENCE_THRESHOLD,
    HARDWARE_BUFFER_DELAY,
)

logger = logging.getLogger(__name__)


class AudioHandler:
    """Handles audio input (mic) and output (speaker) using PyAudio."""
    
    def __init__(
        self,
        sample_rate: int = 16000,
        chunk_size: int = 2048,
        input_device: Optional[int] = None,
        output_device: Optional[int] = None
    ):
        """
        Initialize audio handler.
        
        Args:
            sample_rate: Audio sample rate in Hz (default: 16000 for STT)
            chunk_size: Audio buffer size in frames
            input_device: Input device index (None for default)
            output_device: Output device index (None for default)
        """
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.input_device = input_device
        self.output_device = output_device
        
        self.audio = pyaudio.PyAudio()
        self.input_stream: Optional[pyaudio.Stream] = None
        self.output_stream: Optional[pyaudio.Stream] = None
        self.is_recording = False
        self.recording_thread: Optional[Thread] = None
        self.stop_event = Event()
    
    def list_devices(self) -> list[dict]:
        """
        List available audio devices.
        
        Returns:
            List of device info dicts
        """
        devices = []
        for i in range(self.audio.get_device_count()):
            info = self.audio.get_device_info_by_index(i)
            devices.append({
                "index": i,
                "name": info.get("name", "Unknown"),
                "max_input_channels": info.get("maxInputChannels", 0),
                "max_output_channels": info.get("maxOutputChannels", 0),
                "default_sample_rate": info.get("defaultSampleRate", 0)
            })
        return devices
    
    def find_input_device(self, name_pattern: Optional[str] = None) -> Optional[int]:
        """
        Find input device by name pattern.
        
        Args:
            name_pattern: Pattern to match in device name (case-insensitive)
        
        Returns:
            Device index or None
        """
        devices = self.list_devices()
        for device in devices:
            if device["max_input_channels"] > 0:
                if name_pattern:
                    if name_pattern.lower() in device["name"].lower():
                        return device["index"]
                else:
                    return device["index"]  # Return first input device
        return None
    
    def find_output_device(self, name_pattern: Optional[str] = None) -> Optional[int]:
        """
        Find output device by name pattern.
        
        Args:
            name_pattern: Pattern to match in device name (case-insensitive)
        
        Returns:
            Device index or None
        """
        devices = self.list_devices()
        for device in devices:
            if device["max_output_channels"] > 0:
                if name_pattern:
                    if name_pattern.lower() in device["name"].lower():
                        return device["index"]
                else:
                    return device["index"]  # Return first output device
        return None
    
    def _get_device_supported_rate(self, device_index: int, preferred_rate: int) -> int:
        """
        Get a supported sample rate for a device.
        Tries preferred rate first, then common high-quality rates (48000, 44100), then device default, then lower rates.
        
        Args:
            device_index: Audio device index
            preferred_rate: Preferred sample rate
        
        Returns:
            Supported sample rate
        """
        device_info = self.audio.get_device_info_by_index(device_index)
        default_rate = int(device_info.get("defaultSampleRate", 44100))
        
        # Try preferred rate first
        try:
            test_stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=preferred_rate,
                input=True,
                input_device_index=device_index,
                frames_per_buffer=1024
            )
            test_stream.close()
            return preferred_rate
        except Exception:
            pass
        
        # Try common high-quality rates first (48000Hz is often better than device default)
        # Priority: 48000 > 44100 > device default > 16000 > 8000
        high_quality_rates = [48000, 44100]
        for rate in high_quality_rates:
            if rate == preferred_rate:
                continue
            try:
                test_stream = self.audio.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=rate,
                    input=True,
                    input_device_index=device_index,
                    frames_per_buffer=1024
                )
                test_stream.close()
                logger.warning(f"Device {device_index} doesn't support {preferred_rate}Hz, using {rate}Hz")
                return rate
            except Exception:
                continue
        
        # Try device default rate (if not already tried)
        if default_rate != preferred_rate and default_rate not in high_quality_rates:
            try:
                test_stream = self.audio.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=default_rate,
                    input=True,
                    input_device_index=device_index,
                    frames_per_buffer=1024
                )
                test_stream.close()
                logger.warning(f"Device {device_index} doesn't support {preferred_rate}Hz, using default {default_rate}Hz")
                return default_rate
            except Exception:
                pass
        
        # Try lower quality fallback rates
        for fallback_rate in [16000, 8000]:
            if fallback_rate == preferred_rate or fallback_rate == default_rate:
                continue
            try:
                test_stream = self.audio.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=fallback_rate,
                    input=True,
                    input_device_index=device_index,
                    frames_per_buffer=1024
                )
                test_stream.close()
                logger.warning(f"Device {device_index} doesn't support {preferred_rate}Hz, using fallback {fallback_rate}Hz")
                return fallback_rate
            except Exception:
                continue
        
        # If all else fails, return default
        logger.error(f"Could not find supported sample rate for device {device_index}, using default {default_rate}Hz")
        return default_rate
    
    def start_recording(self, callback: Optional[Callable[[bytes], None]] = None) -> Generator[bytes, None, None]:
        """
        Start recording from microphone.
        
        Args:
            callback: Optional callback function for each audio chunk
        
        Yields:
            Audio chunks as bytes (Int16 PCM)
        """
        if self.is_recording:
            logger.warning("Already recording")
            return
        
        # Auto-detect input device if not specified
        input_device = self.input_device
        if input_device is None:
            input_device = self.find_input_device()
            if input_device is None:
                raise Exception("No input device found")
        
        # Get a supported sample rate for this device
        actual_sample_rate = self._get_device_supported_rate(input_device, self.sample_rate)
        
        # Update sample rate if different
        if actual_sample_rate != self.sample_rate:
            logger.info(f"Using sample rate {actual_sample_rate}Hz instead of {self.sample_rate}Hz for device {input_device}")
            self.sample_rate = actual_sample_rate
        
        try:
            self.input_stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                input=True,
                input_device_index=input_device,
                frames_per_buffer=self.chunk_size
            )
            
            self.is_recording = True
            self.stop_event.clear()
            
            logger.info(f"Started recording from device {input_device} at {self.sample_rate}Hz")
            
            while self.is_recording and not self.stop_event.is_set():
                try:
                    data = self.input_stream.read(self.chunk_size, exception_on_overflow=False)
                    if callback:
                        callback(data)
                    yield data
                except Exception as e:
                    logger.error(f"Error reading audio: {e}")
                    break
        
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            raise
        finally:
            self.stop_recording()
    
    def stop_recording(self) -> None:
        """Stop recording."""
        self.is_recording = False
        self.stop_event.set()
        
        if self.input_stream:
            try:
                self.input_stream.stop_stream()
                self.input_stream.close()
            except Exception as e:
                logger.error(f"Error stopping input stream: {e}")
            finally:
                self.input_stream = None
    
    def play_audio(self, audio_data: bytes, format: str = "mp3") -> None:
        """
        Play audio data through speaker.
        
        Args:
            audio_data: Audio data bytes (MP3, WAV, etc.)
            format: Audio format ('mp3', 'wav', 'raw')
        """
        if format == "raw":
            # Raw PCM data
            self._play_raw(audio_data)
        elif format == "wav":
            # WAV file
            self._play_wav(audio_data)
        elif format == "mp3":
            # MP3 file - convert to WAV first
            self._play_mp3(audio_data)
        else:
            raise ValueError(f"Unsupported audio format: {format}")
    
    def _play_raw(self, pcm_data: bytes) -> None:
        """Play raw PCM audio data."""
        # Auto-detect output device if not specified
        output_device = self.output_device
        if output_device is None:
            output_device = self.find_output_device()
            if output_device is None:
                raise Exception("No output device found")
        
        try:
            stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                output=True,
                output_device_index=output_device,
                frames_per_buffer=self.chunk_size
            )
            
            # Write audio data in chunks
            chunk_size = self.chunk_size * 2  # 2 bytes per Int16 sample
            for i in range(0, len(pcm_data), chunk_size):
                chunk = pcm_data[i:i + chunk_size]
                stream.write(chunk)
            
            stream.stop_stream()
            stream.close()
        
        except Exception as e:
            logger.error(f"Failed to play raw audio: {e}")
            raise
    
    def _play_wav(self, wav_data: bytes) -> None:
        """Play WAV audio data."""
        try:
            wav_file = wave.open(io.BytesIO(wav_data), 'rb')
            sample_rate = wav_file.getframerate()
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            
            # Auto-detect output device if not specified
            output_device = self.output_device
            if output_device is None:
                output_device = self.find_output_device()
                if output_device is None:
                    raise Exception("No output device found")
            
            stream = self.audio.open(
                format=self.audio.get_format_from_width(sample_width),
                channels=channels,
                rate=sample_rate,
                output=True,
                output_device_index=output_device
            )
            
            data = wav_file.readframes(self.chunk_size)
            while data:
                stream.write(data)
                data = wav_file.readframes(self.chunk_size)
            
            stream.stop_stream()
            stream.close()
            wav_file.close()
        
        except Exception as e:
            logger.error(f"Failed to play WAV audio: {e}")
            raise
    
    def _play_mp3(self, mp3_data: bytes) -> None:
        """Play MP3 audio data by converting to WAV first."""
        try:
            # Try using pydub to convert MP3 to WAV
            from pydub import AudioSegment
            from pydub.playback import play
            
            audio = AudioSegment.from_mp3(io.BytesIO(mp3_data))
            
            # Export to raw PCM
            pcm_data = audio.raw_data
            
            # Get sample rate and channels from audio segment
            sample_rate = audio.frame_rate
            channels = audio.channels
            sample_width = audio.sample_width
            
            # Auto-detect output device if not specified
            output_device = self.output_device
            if output_device is None:
                output_device = self.find_output_device()
                if output_device is None:
                    raise Exception("No output device found")
            
            stream = self.audio.open(
                format=self.audio.get_format_from_width(sample_width),
                channels=channels,
                rate=sample_rate,
                output=True,
                output_device_index=output_device
            )
            
            # Write audio data in chunks
            chunk_size = self.chunk_size * sample_width * channels
            for i in range(0, len(pcm_data), chunk_size):
                chunk = pcm_data[i:i + chunk_size]
                stream.write(chunk)
            
            stream.stop_stream()
            stream.close()
        
        except ImportError:
            logger.error("pydub not installed. Cannot play MP3. Install with: pip install pydub")
            raise
        except Exception as e:
            logger.error(f"Failed to play MP3 audio: {e}")
            raise
    
    def start_streaming_playback(self, sample_rate: int = 48000) -> 'StreamingSpeaker':
        """
        Start streaming audio playback for PCM chunks.
        
        Args:
            sample_rate: Sample rate for audio playback (default: 48000 for Deepgram TTS)
        
        Returns:
            StreamingSpeaker instance for playing PCM chunks
        """
        return StreamingSpeaker(
            audio=self.audio,
            sample_rate=sample_rate,
            chunk_size=self.chunk_size,
            output_device=self.output_device
        )
    
    def close(self) -> None:
        """Close audio handler and cleanup resources."""
        self.stop_recording()
        
        if self.output_stream:
            try:
                self.output_stream.stop_stream()
                self.output_stream.close()
            except Exception:
                pass
        
        try:
            self.audio.terminate()
        except Exception:
            pass


class StreamingSpeaker:
    """
    Plays PCM audio chunks from a queue in a background thread.
    Used for streaming TTS (e.g., Deepgram Aura-2).
    """
    
    def __init__(
        self,
        audio: pyaudio.PyAudio,
        sample_rate: int = 48000,
        chunk_size: int = 2048,
        output_device: Optional[int] = None
    ):
        """
        Initialize streaming speaker.
        
        Args:
            audio: PyAudio instance
            sample_rate: Audio sample rate in Hz
            chunk_size: Audio buffer size in frames
            output_device: Output device index (None for default)
        """
        self.audio = audio
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.output_device = output_device
        self.q: queue.Queue[bytes] = queue.Queue()
        self.exit = Event()
        self.stream: Optional[pyaudio.Stream] = None
        self.th: Optional[Thread] = None
        self.is_playing = False
        self.last_audio_time = 0.0  # Timestamp of last audio chunk played
        self.queue_empty_duration = 0.0  # Duration queue has been empty
        
        # Audio level tracking for definitive playback detection
        self.audio_levels: list[float] = []  # Rolling window of recent audio levels (RMS)
        self.max_audio_levels = AUDIO_LEVELS_MAX_SAMPLES
        self.silence_threshold_db = AUDIO_SILENCE_THRESHOLD_DB
        self.last_audio_level_time = 0.0  # Timestamp of last non-silent audio
        self.audio_level_silence_duration = 0.0  # Duration audio has been silent
        self.total_audio_written = 0  # Total bytes written to stream (for buffer tracking)
    
    def find_output_device(self) -> Optional[int]:
        """Find output device if not specified."""
        if self.output_device is not None:
            return self.output_device
        
        for i in range(self.audio.get_device_count()):
            info = self.audio.get_device_info_by_index(i)
            if info.get("maxOutputChannels", 0) > 0:
                return i
        return None
    
    def start(self) -> None:
        """Start the streaming speaker thread."""
        if self.th and self.th.is_alive():
            logger.warning("Streaming speaker already started")
            return
        
        output_device = self.find_output_device()
        if output_device is None:
            raise Exception("No output device found")
        
        try:
            self.stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                output=True,
                output_device_index=output_device,
                frames_per_buffer=self.chunk_size
            )
            
            self.exit.clear()
            self.th = Thread(target=self._run, daemon=True)
            self.th.start()
            self.is_playing = True
            logger.info(f"Started streaming speaker at {self.sample_rate}Hz")
        except Exception as e:
            logger.error(f"Failed to start streaming speaker: {e}")
            raise
    
    def stop(self) -> None:
        """Stop the streaming speaker thread."""
        self.exit.set()
        self.is_playing = False
        
        if self.th:
            self.th.join(timeout=STREAMING_SPEAKER_STOP_TIMEOUT)
            self.th = None
        
        if self.stream:
            try:
                self.stream.stop_stream()
                self.stream.close()
            except Exception:
                pass
            finally:
                self.stream = None
        
        # Clear queue
        self.clear_queue()

        logger.info("Stopped streaming speaker")

    def clear_queue(self) -> None:
        """Drain all pending audio chunks from the queue."""
        count = 0
        while not self.q.empty():
            try:
                self.q.get_nowait()
                count += 1
            except queue.Empty:
                break
        if count > 0:
            logger.debug(f"Cleared {count} chunks from audio queue")

    def reset_tracking(self) -> None:
        """
        Reset audio level and timing tracking to initial state.
        Call this after feedback audio (beep/ambient) stops so that
        TTS completion detection starts fresh.
        """
        self.last_audio_time = 0.0
        self.queue_empty_duration = 0.0
        self.audio_levels.clear()
        self.last_audio_level_time = 0.0
        self.audio_level_silence_duration = 0.0
        self.total_audio_written = 0
        logger.debug("Reset streaming speaker tracking state")

    def play(self, data: bytes) -> None:
        """
        Queue audio chunk for playback.
        
        Args:
            data: PCM audio data as bytes (Int16, mono)
        """
        if not self.is_playing:
            logger.warning("Streaming speaker not started, cannot play audio")
            return
        
        try:
            self.q.put(data, block=False)
        except queue.Full:
            logger.warning("Audio queue full, dropping chunk")
    
    def _calculate_rms_level(self, audio_data: bytes) -> float:
        """
        Calculate RMS (Root Mean Square) audio level in dB.
        
        Args:
            audio_data: PCM audio data (Int16, mono)
        
        Returns:
            RMS level in dB (negative values, -inf for silence)
        """
        try:
            import numpy as np
            # Convert bytes to numpy array (Int16)
            audio_array = np.frombuffer(audio_data, dtype=np.int16)
            
            if len(audio_array) == 0:
                return float('-inf')
            
            # Calculate RMS
            rms = np.sqrt(np.mean(audio_array.astype(np.float32) ** 2))
            
            # Convert to dB (avoid log(0))
            if rms > 0:
                db_level = 20 * np.log10(rms / 32768.0)  # Normalize to full scale
            else:
                db_level = float('-inf')
            
            return db_level
        except Exception as e:
            logger.debug(f"Error calculating RMS level: {e}")
            return float('-inf')
    
    def _update_audio_levels(self, audio_chunk: bytes) -> None:
        """
        Update audio level tracking with new chunk.
        
        Args:
            audio_chunk: Audio data chunk
        """
        import time
        current_time = time.time()
        level_db = self._calculate_rms_level(audio_chunk)
        
        # Add to rolling window
        self.audio_levels.append(level_db)
        if len(self.audio_levels) > self.max_audio_levels:
            self.audio_levels.pop(0)
        
        # Track silence duration
        if level_db > self.silence_threshold_db:
            # Non-silent audio detected
            self.last_audio_level_time = current_time
            self.audio_level_silence_duration = 0.0
        else:
            # Silent audio
            if self.last_audio_level_time > 0:
                self.audio_level_silence_duration = current_time - self.last_audio_level_time
            else:
                self.audio_level_silence_duration = 0.0
    
    def _run(self) -> None:
        """Background thread that plays audio from queue."""
        import time
        try:
            while not self.exit.is_set():
                try:
                    audio_chunk = self.q.get(timeout=STREAMING_SPEAKER_QUEUE_TIMEOUT)
                    if self.stream:
                        # Write audio to stream
                        self.stream.write(audio_chunk)
                        self.total_audio_written += len(audio_chunk)
                        
                        # Update tracking
                        self.last_audio_time = time.time()
                        self.queue_empty_duration = 0.0
                        
                        # Update audio level tracking
                        self._update_audio_levels(audio_chunk)
                except queue.Empty:
                    # Track how long queue has been empty
                    current_time = time.time()
                    if self.last_audio_time > 0:
                        self.queue_empty_duration = current_time - self.last_audio_time
                    
                    # Update silence duration for audio levels
                    if self.last_audio_level_time > 0:
                        self.audio_level_silence_duration = current_time - self.last_audio_level_time
                    
                    continue
                except Exception as e:
                    logger.error(f"Error playing audio chunk: {e}")
        except Exception as e:
            logger.error(f"Error in streaming speaker thread: {e}")
        finally:
            if self.stream:
                try:
                    self.stream.stop_stream()
                except Exception:
                    pass
    
    def is_queue_empty(self) -> bool:
        """Check if audio queue is empty."""
        return self.q.empty()
    
    def get_queue_empty_duration(self) -> float:
        """
        Get duration (in seconds) that queue has been empty.
        Returns 0.0 if queue is not empty or if no audio has been played yet.
        """
        return self.queue_empty_duration if self.is_queue_empty() else 0.0
    
    def is_audio_silent(self, silence_duration_threshold: float = AUDIO_SILENCE_THRESHOLD) -> bool:
        """
        Check if audio has been silent for the threshold duration.
        
        Args:
            silence_duration_threshold: Duration (seconds) of silence to consider playback finished
        
        Returns:
            True if audio levels have been below threshold for the duration
        """
        if self.last_audio_level_time == 0:
            # No audio has been played yet
            return False
        
        return self.audio_level_silence_duration >= silence_duration_threshold
    
    def get_current_audio_level_db(self) -> float:
        """
        Get the current audio level in dB.
        
        Returns:
            Current audio level in dB, or -inf if no audio data available
        """
        if not self.audio_levels:
            return float('-inf')
        return self.audio_levels[-1]
    
    def get_average_audio_level_db(self, window_size: int = AUDIO_LEVEL_AVERAGE_WINDOW) -> float:
        """
        Get average audio level over recent samples.
        
        Args:
            window_size: Number of recent samples to average
        
        Returns:
            Average audio level in dB
        """
        if not self.audio_levels:
            return float('-inf')
        
        recent_levels = self.audio_levels[-window_size:]
        # Filter out -inf values
        valid_levels = [level for level in recent_levels if level != float('-inf')]
        
        if not valid_levels:
            return float('-inf')
        
        return sum(valid_levels) / len(valid_levels)
    
    def is_stream_active(self) -> bool:
        """
        Check if PyAudio stream is active and has data in buffer.
        
        Returns:
            True if stream is active and may have buffered data
        """
        if not self.stream:
            return False
        
        try:
            # Check if stream is active (not stopped)
            # Note: PyAudio doesn't expose buffer state directly,
            # but we can check if stream is active
            return self.is_playing
        except Exception:
            return False
    
    def _build_detection_info(
        self,
        is_finished: bool,
        queue_condition: bool,
        audio_condition: bool,
        hardware_condition: bool,
        queue_empty_duration: float = None,
        audio_silence_duration: float = None
    ) -> dict:
        """
        Helper method to build detection info dictionary.
        
        Args:
            is_finished: Whether playback is finished
            queue_condition: Whether queue condition is met
            audio_condition: Whether audio condition is met
            hardware_condition: Whether hardware condition is met
            queue_empty_duration: Cached queue empty duration (optional)
            audio_silence_duration: Cached audio silence duration (optional)
        
        Returns:
            Detection info dictionary
        """
        if queue_empty_duration is None:
            queue_empty_duration = self.get_queue_empty_duration()
        if audio_silence_duration is None:
            audio_silence_duration = self.audio_level_silence_duration
        
        return {
            "queue_empty": self.is_queue_empty(),
            "queue_empty_duration": queue_empty_duration,
            "audio_silent": audio_condition,
            "audio_silence_duration": audio_silence_duration,
            "current_level_db": self.get_current_audio_level_db(),
            "avg_level_db": self.get_average_audio_level_db(),
            "stream_active": self.is_stream_active(),
            "total_written": self.total_audio_written,
            "is_finished": is_finished,
            "queue_condition_met": queue_condition,
            "audio_condition_met": audio_condition,
            "hardware_condition_met": hardware_condition
        }
    
    def has_finished_playback(
        self,
        queue_silence_threshold: float = QUEUE_SILENCE_THRESHOLD,
        audio_silence_threshold: float = AUDIO_SILENCE_THRESHOLD,
        hardware_buffer_delay: float = HARDWARE_BUFFER_DELAY
    ) -> tuple[bool, dict[str, any]]:
        """
        Check if playback has finished using optimized multi-factor detection.
        
        OPTIMIZED: Uses unified threshold calculation to eliminate redundancy and
        reduce turn-around time. Early exits for common cases.
        
        This method combines:
        1. Queue state (empty for threshold duration)
        2. Audio level analysis (silence detected)
        3. Hardware buffer consideration (additional delay)
        
        Args:
            queue_silence_threshold: Duration (seconds) queue must be empty
            audio_silence_threshold: Duration (seconds) audio must be silent
            hardware_buffer_delay: Additional delay (seconds) for hardware buffer drain
        
        Returns:
            Tuple of (is_finished, detection_info_dict)
        """
        # FAST PATH: Early exit if queue is not empty (most common case)
        queue_empty = self.is_queue_empty()
        if not queue_empty:
            # Queue has data, definitely not finished - return immediately
            return False, self._build_detection_info(False, False, False, False)
        
        # Cache expensive operations (called multiple times)
        queue_empty_duration = self.queue_empty_duration  # Direct access, already checked queue is empty
        audio_silence_duration = self.audio_level_silence_duration
        
        # OPTIMIZATION: Use unified threshold - queue must be empty for
        # max(queue_threshold, audio_threshold) + buffer_delay
        # This ensures both conditions are met while minimizing wait time
        required_queue_duration = max(queue_silence_threshold, audio_silence_threshold) + hardware_buffer_delay
        
        # Early exit if queue hasn't been empty long enough
        if queue_empty_duration < required_queue_duration:
            # Build minimal detection info for early exit
            audio_ready = (
                self.last_audio_level_time > 0 and
                audio_silence_duration >= audio_silence_threshold
            )
            queue_condition_met = queue_empty_duration >= queue_silence_threshold
            hardware_condition_met = queue_empty_duration >= required_queue_duration
            
            return False, self._build_detection_info(
                False, queue_condition_met, audio_ready, hardware_condition_met,
                queue_empty_duration, audio_silence_duration
            )
        
        # Check if audio has been silent long enough
        audio_ready = (
            self.last_audio_level_time > 0 and
            audio_silence_duration >= audio_silence_threshold
        )
        
        # Both conditions must be ready
        is_finished = audio_ready
        
        # Build detection info
        queue_condition_met = queue_empty_duration >= queue_silence_threshold
        hardware_condition_met = queue_empty_duration >= required_queue_duration
        
        return is_finished, self._build_detection_info(
            is_finished, queue_condition_met, audio_ready, hardware_condition_met,
            queue_empty_duration, audio_silence_duration
        )


def generate_silence_chunk(chunk_size: int, sample_rate: int = 16000) -> bytes:
    """
    Generate a silence audio chunk for STT keepalive.
    
    Args:
        chunk_size: Number of frames in the chunk
        sample_rate: Sample rate in Hz (default: 16000 for STT)
    
    Returns:
        Silence audio data as bytes (Int16 PCM, mono)
    """
    # Int16 PCM: 2 bytes per sample, mono channel
    # Total bytes = chunk_size * 2 bytes per sample
    num_samples = chunk_size
    return b"\x00" * (num_samples * 2)


def resample_audio_to_16khz(audio_data: bytes, source_sample_rate: int) -> bytes:
    """
    Resample audio data from source sample rate to 16kHz.
    Required because STT services expect 16kHz audio.
    
    Args:
        audio_data: Raw PCM audio data (Int16, mono)
        source_sample_rate: Source sample rate in Hz
    
    Returns:
        Resampled audio data at 16kHz (Int16, mono)
    """
    if source_sample_rate == 16000:
        return audio_data  # No resampling needed
    
    logger.debug(f"Resampling audio from {source_sample_rate}Hz to 16kHz ({len(audio_data)} bytes)")
    
    try:
        from pydub import AudioSegment
        import numpy as np
        
        # Convert bytes to numpy array (Int16)
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        # Create AudioSegment from numpy array
        audio_segment = AudioSegment(
            audio_array.tobytes(),
            frame_rate=source_sample_rate,
            sample_width=2,  # 16-bit = 2 bytes
            channels=1  # Mono
        )
        
        # Resample to 16kHz
        resampled = audio_segment.set_frame_rate(16000)
        
        # Convert back to bytes
        result = resampled.raw_data
        logger.debug(f"Resampled to 16kHz: {len(result)} bytes")
        return result
        
    except ImportError:
        # Fallback: simple linear interpolation (less accurate but works without pydub)
        #logger.warning("pydub not available, using simple resampling (may be less accurate)")
        try:
            import numpy as np
        except ImportError:
            logger.error("numpy not available, cannot resample audio. Returning original data.")
            return audio_data
        
        # Convert to numpy array
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        # Calculate resampling ratio
        ratio = 16000 / source_sample_rate
        target_length = int(len(audio_array) * ratio)
        
        # Simple linear interpolation
        indices = np.linspace(0, len(audio_array) - 1, target_length)
        resampled = np.interp(indices, np.arange(len(audio_array)), audio_array)
        
        # Convert back to Int16 and bytes
        result = resampled.astype(np.int16).tobytes()
        logger.debug(f"Resampled to 16kHz (simple method): {len(result)} bytes")
        return result
    except Exception as e:
        logger.error(f"Error resampling audio: {e}", exc_info=True)
        # Return original data if resampling fails
        return audio_data
