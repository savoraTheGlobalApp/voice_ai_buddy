/**
 * STT Integration Example for Voice AI Buddy
 * Shows how to integrate the WebSocket STT with the existing app
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useSTT, STTStatus } from '@/lib/hooks/useSTT';

interface STTIntegrationProps {
  onTextReceived?: (text: string) => void;
  onStartListening?: () => void;
  onStopListening?: () => void;
  enabled?: boolean;
  className?: string;
}

export default function STTIntegration({
  onTextReceived,
  onStartListening,
  onStopListening,
  enabled = true,
  className = ''
}: STTIntegrationProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  const {
    status,
    isConnected,
    isRecording,
    lastTranscription,
    error,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    clearError
  } = useSTT({
    config: {
      language: 'en',
      silenceThreshold: 25, // More sensitive for children
      maxRecordingTime: 15000, // 15 seconds max for child attention spans
    },
    autoConnect: enabled,
    onTranscription: (text) => {
      console.log('STT Transcription received:', text);
      onTextReceived?.(text);
    },
    onError: (errorMsg) => {
      console.error('STT Integration Error:', errorMsg);
    }
  });

  // Initialize connection when enabled
  React.useEffect(() => {
    if (enabled && !isInitialized) {
      connect()
        .then(() => setIsInitialized(true))
        .catch(console.error);
    } else if (!enabled && isInitialized) {
      disconnect();
      setIsInitialized(false);
    }
  }, [enabled, isInitialized, connect, disconnect]);

  const handleStartRecording = useCallback(async () => {
    if (!isConnected) {
      try {
        await connect();
      } catch (err) {
        console.error('Failed to connect before recording:', err);
        return;
      }
    }

    try {
      await startRecording();
      onStartListening?.();
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [isConnected, connect, startRecording, onStartListening]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    onStopListening?.();
  }, [stopRecording, onStopListening]);

  if (!enabled) {
    return null;
  }

  return (
    <div className={`stt-integration ${className}`}>
      {/* Status Indicator (can be styled to match your app) */}
      {status === STTStatus.ERROR && error && (
        <div className="stt-error-indicator">
          <div className="error-message">
            STT Error: {error}
            <button onClick={clearError} className="clear-error-btn">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Recording Button */}
      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={!enabled || status === STTStatus.CONNECTING}
        className={`stt-record-button ${isRecording ? 'recording' : ''} ${
          !isConnected ? 'disconnected' : ''
        }`}
        title={
          isRecording 
            ? 'Stop recording and transcribe'
            : isConnected 
              ? 'Start voice recording'
              : 'Connecting to STT service...'
        }
      >
        {status === STTStatus.CONNECTING && '⏳'}
        {status === STTStatus.LISTENING && '🔴'}
        {status === STTStatus.PROCESSING && '⚡'}
        {(status === STTStatus.CONNECTED || status === STTStatus.DISCONNECTED) && '🎤'}
        {status === STTStatus.ERROR && '❌'}
      </button>

      {/* Status Text (optional, can be hidden with CSS) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="stt-debug-info">
          <div>Status: {status}</div>
          <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
          <div>Recording: {isRecording ? 'Yes' : 'No'}</div>
          {lastTranscription && (
            <div>Last: {lastTranscription.substring(0, 50)}...</div>
          )}
        </div>
      )}
    </div>
  );
}

// CSS styles that can be added to your global CSS or component styles
export const STTIntegrationStyles = `
.stt-integration {
  position: relative;
}

.stt-record-button {
  background: #3b82f6;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.stt-record-button:hover {
  background: #2563eb;
  transform: scale(1.05);
}

.stt-record-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  transform: none;
}

.stt-record-button.recording {
  background: #ef4444;
  animation: pulse 1.5s infinite;
}

.stt-record-button.disconnected {
  background: #6b7280;
}

.stt-error-indicator {
  position: absolute;
  top: -40px;
  left: 0;
  right: 0;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  color: #dc2626;
}

.stt-debug-info {
  position: absolute;
  top: 60px;
  left: 0;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px;
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
  z-index: 1000;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
`;