"""
Audio handler for microphone input and speaker output using PyAudio.
Replaces browser audio APIs (getUserMedia, AudioContext) with PyAudio.
"""
import logging
import pyaudio
import wave
import io
from typing import Optional, Callable, Generator
from threading import Thread, Event

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

