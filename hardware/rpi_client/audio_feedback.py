"""
Audio feedback manager for perceived latency reduction.

Plays a confirmation beep when user input is received, followed by
ambient thinking music until TTS audio starts playing. All audio is
routed through the existing StreamingSpeaker queue (48kHz Int16 PCM mono)
since PyAudio only supports one output stream per device.
"""
import logging
import threading
import time
from pathlib import Path
from typing import Optional, List

import numpy as np

from .constants import (
    FEEDBACK_BEEP_FREQUENCY,
    FEEDBACK_BEEP_DURATION,
    FEEDBACK_BEEP_VOLUME,
    FEEDBACK_AMBIENT_DELAY,
    FEEDBACK_AMBIENT_CHUNK_MS,
    FEEDBACK_AMBIENT_VOLUME,
)

logger = logging.getLogger(__name__)

SPEAKER_SAMPLE_RATE = 48000


class AudioFeedbackManager:
    """
    Manages audio feedback (beep + ambient music) to reduce perceived latency.

    All audio is queued to the existing StreamingSpeaker instance so it
    plays through the same PyAudio output stream as TTS audio.
    """

    def __init__(self, streaming_speaker, ambient_path: Optional[str] = None):
        """
        Initialize audio feedback manager.

        Args:
            streaming_speaker: StreamingSpeaker instance (48kHz, Int16, mono)
            ambient_path: Path to ambient music file (mp3/wav). If None,
                          ambient music is disabled.
        """
        self.speaker = streaming_speaker
        self._ambient_stop = threading.Event()
        self._ambient_thread: Optional[threading.Thread] = None

        # Pre-generate beep
        self._beep_data = self._generate_beep()
        logger.info(
            f"Generated confirmation beep: {len(self._beep_data)} bytes "
            f"({FEEDBACK_BEEP_FREQUENCY}Hz, {FEEDBACK_BEEP_DURATION}s)"
        )

        # Pre-load ambient music chunks
        self._ambient_chunks: List[bytes] = []
        if ambient_path:
            self._load_ambient_music(ambient_path)

    # ------------------------------------------------------------------
    # Beep
    # ------------------------------------------------------------------

    def _generate_beep(self) -> bytes:
        """
        Generate a short sine-wave beep as 48kHz Int16 PCM bytes.

        Uses a Hann window envelope for smooth fade-in/fade-out to
        prevent click artifacts.
        """
        num_samples = int(SPEAKER_SAMPLE_RATE * FEEDBACK_BEEP_DURATION)
        t = np.arange(num_samples, dtype=np.float64) / SPEAKER_SAMPLE_RATE

        # Sine wave
        wave = np.sin(2.0 * np.pi * FEEDBACK_BEEP_FREQUENCY * t)

        # Hann envelope (fade in/out)
        envelope = np.hanning(num_samples)
        wave *= envelope

        # Scale volume and convert to Int16
        wave *= FEEDBACK_BEEP_VOLUME * 32767.0
        return wave.astype(np.int16).tobytes()

    def play_beep(self) -> None:
        """Queue the confirmation beep to the speaker. Non-blocking."""
        if not self.speaker or not self.speaker.is_playing:
            logger.warning("Speaker not available, skipping beep")
            return
        self.speaker.play(self._beep_data)
        logger.info("Playing confirmation beep")

    # ------------------------------------------------------------------
    # Ambient music
    # ------------------------------------------------------------------

    def _load_ambient_music(self, path: str) -> None:
        """
        Load an audio file and convert to 48kHz Int16 PCM chunks.

        Uses ffmpeg directly (pydub's audioop dependency was removed in
        Python 3.13).

        Args:
            path: Path to mp3 or wav file.
        """
        resolved = Path(path)
        if not resolved.exists():
            logger.warning(f"Ambient music file not found: {path}")
            return

        try:
            import subprocess, math

            result = subprocess.run(
                [
                    "ffmpeg", "-i", str(resolved),
                    "-ar", str(SPEAKER_SAMPLE_RATE),
                    "-ac", "1",
                    "-f", "s16le",
                    "-loglevel", "error",
                    "pipe:1",
                ],
                capture_output=True,
            )

            if result.returncode != 0:
                logger.error(f"ffmpeg failed: {result.stderr.decode()}")
                return

            raw_data = bytearray(result.stdout)

            # Apply volume scaling in-place
            if FEEDBACK_AMBIENT_VOLUME < 1.0:
                samples = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32)
                samples *= FEEDBACK_AMBIENT_VOLUME
                raw_data = np.clip(samples, -32768, 32767).astype(np.int16).tobytes()

            # Split into fixed-size chunks
            samples_per_chunk = int(SPEAKER_SAMPLE_RATE * FEEDBACK_AMBIENT_CHUNK_MS / 1000)
            bytes_per_chunk = samples_per_chunk * 2  # Int16 = 2 bytes/sample

            self._ambient_chunks = [
                raw_data[i : i + bytes_per_chunk]
                for i in range(0, len(raw_data), bytes_per_chunk)
            ]

            duration_s = len(raw_data) / (SPEAKER_SAMPLE_RATE * 2)
            logger.info(
                f"Loaded ambient music: {resolved.name} "
                f"({duration_s:.1f}s, {len(self._ambient_chunks)} chunks)"
            )
        except Exception as e:
            logger.error(f"Failed to load ambient music: {e}", exc_info=True)

    def start_ambient(self, loop: bool = True) -> None:
        """
        Start playing ambient music after a short delay.

        A background thread queues chunks to the StreamingSpeaker. Call
        stop_ambient() to interrupt.

        Args:
            loop: If True, loop the ambient track until stopped.
        """
        if not self._ambient_chunks:
            logger.debug("No ambient music loaded, skipping")
            return

        # Stop any previous ambient playback
        self.stop_ambient()

        self._ambient_stop.clear()
        self._ambient_thread = threading.Thread(
            target=self._ambient_loop,
            args=(loop,),
            daemon=True,
        )
        self._ambient_thread.start()
        logger.info("Starting ambient music playback")

    def _ambient_loop(self, loop: bool) -> None:
        """Background thread that queues ambient chunks to the speaker."""
        # Wait before starting (let the beep finish)
        if self._ambient_stop.wait(timeout=FEEDBACK_AMBIENT_DELAY):
            return  # Stopped before delay elapsed

        chunk_interval = FEEDBACK_AMBIENT_CHUNK_MS / 1000.0

        while not self._ambient_stop.is_set():
            for chunk in self._ambient_chunks:
                if self._ambient_stop.is_set():
                    return
                if self.speaker and self.speaker.is_playing:
                    self.speaker.play(chunk)
                # Pace the queuing so we don't flood the queue
                if self._ambient_stop.wait(timeout=chunk_interval):
                    return  # Stopped
            if not loop:
                break

        logger.debug("Ambient music loop exited")

    def stop_ambient(self) -> None:
        """
        Stop ambient music and flush remaining ambient chunks from the
        speaker queue. Also resets speaker tracking so TTS completion
        detection starts fresh.
        """
        self._ambient_stop.set()

        if self._ambient_thread and self._ambient_thread.is_alive():
            self._ambient_thread.join(timeout=0.5)
            self._ambient_thread = None

        # Flush leftover ambient chunks from queue
        if self.speaker:
            self.speaker.clear_queue()
            self.speaker.reset_tracking()

        logger.info("Stopped ambient music")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def cleanup(self) -> None:
        """Stop any active feedback audio."""
        self.stop_ambient()
