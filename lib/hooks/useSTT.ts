/**
 * React hook for Speech-to-Text using WebSocket connection
 * Provides easy integration with React components
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketSTT, STTConfig, STTCallbacks, STTStatus, createSTTClient } from '../websocket-stt';

export interface UseSTTOptions {
  config?: STTConfig;
  autoConnect?: boolean;
  onTranscription?: (text: string, timestamp?: number, latencyMs?: number) => void;
  onError?: (error: string) => void;
}

export interface UseSTTReturn {
  // State
  status: STTStatus;
  isConnected: boolean;
  isRecording: boolean;  
  lastTranscription: string;
  lastLatencyMs: number | null;
  error: string | null;
  
  // Actions  
  connect: () => Promise<void>;
  disconnect: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  toggleRecording: () => Promise<void>;
  updateConfig: (config: Partial<STTConfig>) => void;
  ping: () => void;
  clearError: () => void;
}

export function useSTT(options: UseSTTOptions = {}): UseSTTReturn {
  const {
    config = {},
    autoConnect = false,
    onTranscription,
    onError
  } = options;

  // State
  const [status, setStatus] = useState<STTStatus>(STTStatus.DISCONNECTED);
  const [lastTranscription, setLastTranscription] = useState<string>('');
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const sttClientRef = useRef<WebSocketSTT | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize STT client
  useEffect(() => {
    if (isInitializedRef.current) return;
    
    const callbacks: STTCallbacks = {
      onTranscription: (text: string, timestamp?: number, latencyMs?: number) => {
        setLastTranscription(text);
        setLastLatencyMs(latencyMs || null);
        setError(null); // Clear any previous errors on successful transcription
        
        // Console log the latency information
        if (latencyMs !== undefined) {
          console.log(`%c[useSTT Hook] 🚀 Speech-to-Text latency: ${latencyMs}ms`, 'color: #8b5cf6; font-weight: bold;');
          console.log(`%c[useSTT Hook] 💬 Transcribed: "${text}"`, 'color: #06b6d4;');
          console.log('─'.repeat(60));
        }
        
        onTranscription?.(text, timestamp, latencyMs);
      },
      onError: (errorMsg: string) => {
        setError(errorMsg);
        onError?.(errorMsg);
      },
      onConnect: () => {
        setError(null);
      },
      onDisconnect: () => {
        // Keep error state if there was one
      },
      onStatusChange: (newStatus: STTStatus) => {
        setStatus(newStatus);
      }
    };

    sttClientRef.current = createSTTClient(config, callbacks);
    isInitializedRef.current = true;

    // Auto-connect if requested
    if (autoConnect) {
      sttClientRef.current.connect().catch((err: any) => {
        console.error('Auto-connect failed:', err);
        setError('Failed to auto-connect to STT service');
      });
    }

    return () => {
      if (sttClientRef.current) {
        sttClientRef.current.disconnect();
      }
    };
  }, [autoConnect, onTranscription, onError]);

  // Actions
  const connect = useCallback(async () => {
    if (!sttClientRef.current) {
      throw new Error('STT client not initialized');
    }
    
    try {
      setError(null);
      await sttClientRef.current.connect();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (sttClientRef.current) {
      sttClientRef.current.disconnect();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!sttClientRef.current) {
      throw new Error('STT client not initialized');
    }

    try {
      setError(null);
      await sttClientRef.current.startRecording();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (sttClientRef.current) {
      sttClientRef.current.stopRecording();
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (!sttClientRef.current) {
      throw new Error('STT client not initialized');
    }

    if (sttClientRef.current.isCurrentlyRecording()) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [startRecording, stopRecording]);

  const updateConfig = useCallback((newConfig: Partial<STTConfig>) => {
    if (sttClientRef.current) {
      sttClientRef.current.updateConfig(newConfig);
    }
  }, []);

  const ping = useCallback(() => {
    if (sttClientRef.current) {
      sttClientRef.current.ping();
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Computed values
  const isConnected = status === STTStatus.CONNECTED || 
                     status === STTStatus.LISTENING || 
                     status === STTStatus.PROCESSING;
  
  const isRecording = status === STTStatus.LISTENING;

  return {
    // State
    status,
    isConnected,
    isRecording,
    lastTranscription,
    lastLatencyMs,
    error,
    
    // Actions
    connect,
    disconnect,
    startRecording,
    stopRecording,
    toggleRecording,
    updateConfig,
    ping,
    clearError,
  };
}

// Export the status enum for convenience
export { STTStatus } from '../websocket-stt';