/**
 * WebSocket-based Speech-to-Text client using OpenAI Whisper API
 * Handles real-time audio streaming and transcription
 */

export interface STTConfig {
  language?: string;
  sampleRate?: number;
  bufferSize?: number;
  silenceThreshold?: number;
  maxRecordingTime?: number;
}

export interface STTMessage {
  type: 'transcription' | 'error' | 'config_updated' | 'pong';
  text?: string;
  message?: string;
  timestamp?: number;
}

export interface STTCallbacks {
  onTranscription?: (text: string, timestamp?: number, latencyMs?: number) => void;
  onError?: (error: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onStatusChange?: (status: STTStatus) => void;
}

export enum STTStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  LISTENING = 'listening',
  PROCESSING = 'processing',
  ERROR = 'error'
}

export class WebSocketSTT {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private recordingTimer: ReturnType<typeof setTimeout> | null = null;
  
  private config: STTConfig;
  private callbacks: STTCallbacks;
  private status: STTStatus = STTStatus.DISCONNECTED;
  private isRecording = false;
  private audioChunks: Blob[] = [];
  private recordingStartTime: number | null = null;
  
  constructor(
    private wsUrl: string,
    config: STTConfig = {},
    callbacks: STTCallbacks = {}
  ) {
    this.config = {
      language: 'en',
      sampleRate: 16000,
      bufferSize: 4096,
      silenceThreshold: 30,
      maxRecordingTime: 30000, // 30 seconds max
      ...config
    };
    this.callbacks = callbacks;
  }

  /**
   * Connect to the WebSocket STT service
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket STT already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      this.updateStatus(STTStatus.CONNECTING);
      
      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket STT connected');
          this.updateStatus(STTStatus.CONNECTED);
          this.callbacks.onConnect?.();
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onclose = () => {
          console.log('WebSocket STT disconnected');
          this.updateStatus(STTStatus.DISCONNECTED);
          this.callbacks.onDisconnect?.();
          this.cleanup();
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket STT error:', error);
          this.updateStatus(STTStatus.ERROR);
          this.callbacks.onError?.('WebSocket connection error');
          reject(error);
        };
        
      } catch (error) {
        this.updateStatus(STTStatus.ERROR);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket service
   */
  disconnect(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.cleanup();
    this.updateStatus(STTStatus.DISCONNECTED);
  }

  /**
   * Start recording and real-time transcription
   */
  async startRecording(): Promise<void> {
    if (this.status !== STTStatus.CONNECTED) {
      throw new Error('Not connected to STT service');
    }

    if (this.isRecording) {
      console.log('Already recording');
      return;
    }

    try {
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Set up audio context for silence detection
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      // Set up MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 128000,
      };

      this.mediaRecorder = new MediaRecorder(this.audioStream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.sendAudioChunk(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.processEndOfSpeech();
      };

      // Start recording
      this.mediaRecorder.start(250); // Collect data every 250ms
      this.isRecording = true;
      this.recordingStartTime = Date.now(); // Track start time for latency calculation
      this.updateStatus(STTStatus.LISTENING);
      
      console.log(`%c[STT Frontend] 🎤 Recording started at: ${new Date(this.recordingStartTime).toISOString()}`, 'color: #059669; font-weight: bold;');

      // Set up silence detection
      this.startSilenceDetection();

      // Set maximum recording time
      if (this.config.maxRecordingTime) {
        this.recordingTimer = setTimeout(() => {
          this.stopRecording();
        }, this.config.maxRecordingTime);
      }

      console.log('Started STT recording');

    } catch (error) {
      console.error('Error starting recording:', error);
      this.callbacks.onError?.(`Failed to start recording: ${error}`);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    if (!this.isRecording) {
      return;
    }

    console.log('Stopping STT recording');
    
    this.isRecording = false;
    this.recordingStartTime = null; // Reset start time
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    this.cleanup();
    this.updateStatus(STTStatus.CONNECTED);
  }

  /**
   * Send configuration update to server
   */
  updateConfig(config: Partial<STTConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'config',
        language: this.config.language
      }));
    }
  }

  /**
   * Get current status
   */
  getStatus(): STTStatus {
    return this.status;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  // Private methods

  private handleMessage(data: string): void {
    try {
      const message: STTMessage = JSON.parse(data);
      
      switch (message.type) {
        case 'transcription':
          if (message.text) {
            const transcriptionTime = Date.now();
            let latencyMs: number | undefined;
            
            // Calculate latency if we have a recording start time
            if (this.recordingStartTime) {
              latencyMs = transcriptionTime - this.recordingStartTime;
              console.log(`%c[STT Frontend Latency] Speech-to-Text completed in ${latencyMs}ms`, 'color: #10b981; font-weight: bold;');
              console.log(`%c[STT Frontend] Recording started: ${new Date(this.recordingStartTime).toISOString()}`, 'color: #6b7280;');
              console.log(`%c[STT Frontend] Transcription received: ${new Date(transcriptionTime).toISOString()}`, 'color: #6b7280;');
              console.log(`%c[STT Frontend] Transcribed text: "${message.text}"`, 'color: #3b82f6; font-weight: bold;');
              console.log('─'.repeat(80));
            }
            
            console.log('STT Transcription:', message.text);
            this.callbacks.onTranscription?.(message.text, message.timestamp, latencyMs);
          }
          break;
          
        case 'error':
          console.error('STT Error:', message.message);
          this.callbacks.onError?.(message.message || 'Unknown STT error');
          break;
          
        case 'config_updated':
          console.log('STT Config updated');
          break;
          
        case 'pong':
          // Health check response
          break;
          
        default:
          console.warn('Unknown STT message type:', message.type);
      }
      
    } catch (error) {
      console.error('Error parsing STT message:', error);
      this.callbacks.onError?.('Error parsing server message');
    }
  }

  private async sendAudioChunk(audioBlob: Blob): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Audio = this.arrayBufferToBase64(uint8Array);

      // Send to server
      this.ws.send(JSON.stringify({
        type: 'audio',
        data: base64Audio
      }));

    } catch (error) {
      console.error('Error sending audio chunk:', error);
      this.callbacks.onError?.('Error sending audio data');
    }
  }

  private processEndOfSpeech(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end' }));
    }
    this.updateStatus(STTStatus.PROCESSING);
  }

  private startSilenceDetection(): void {
    if (!this.analyser || !this.dataArray) return;

    const checkSilence = () => {
      if (!this.isRecording || !this.analyser || !this.dataArray) return;

      // Create a new Uint8Array to avoid TypeScript issues
      const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(frequencyData);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        sum += frequencyData[i];
      }
      const average = sum / frequencyData.length;

      // Check if below silence threshold
      if (average < (this.config.silenceThreshold || 30)) {
        if (!this.silenceTimer) {
          // Start silence timer (2 seconds of silence = stop recording)
          this.silenceTimer = setTimeout(() => {
            console.log('Silence detected, stopping recording');
            this.stopRecording();
          }, 2000);
        }
      } else {
        // Audio detected, clear silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      }

      // Continue monitoring
      if (this.isRecording) {
        requestAnimationFrame(checkSilence);
      }
    };

    requestAnimationFrame(checkSilence);
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private updateStatus(newStatus: STTStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatusChange?.(newStatus);
    }
  }

  private cleanup(): void {
    // Clear timers
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

    // Stop audio stream
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }

    // Reset audio components
    this.mediaRecorder = null;
    this.analyser = null;
    this.dataArray = null;
    this.recordingStartTime = null; // Reset latency tracking
    this.audioChunks = [];
  }

  /**
   * Send a ping to check connection health
   */
  ping(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }
}

// Utility function to create STT client with default backend URL
export function createSTTClient(
  config: STTConfig = {},
  callbacks: STTCallbacks = {}
): WebSocketSTT {
  const backendUrl = (typeof window !== 'undefined' && (window as any).ENV?.NEXT_PUBLIC_BACKEND_URL) || 'http://localhost:8000';
  const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/stt';
  
  return new WebSocketSTT(wsUrl, config, callbacks);
}

// Types are already exported above