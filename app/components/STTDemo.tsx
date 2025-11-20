/**
 * Demo component showcasing WebSocket STT functionality
 * This can be integrated into the main app or used as a standalone demo
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useSTT, STTStatus } from '@/lib/hooks/useSTT';

interface STTDemoProps {
  onTranscription?: (text: string) => void;
  className?: string;
}

export default function STTDemo({ onTranscription, className = '' }: STTDemoProps) {
  const [transcriptionHistory, setTranscriptionHistory] = useState<Array<{
    text: string;
    timestamp: number;
  }>>([]);
  const [isVisible, setIsVisible] = useState(false);

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
    toggleRecording,
    clearError,
    updateConfig
  } = useSTT({
    config: {
      language: 'en',
      silenceThreshold: 30,
      maxRecordingTime: 30000, // 30 seconds
    },
    onTranscription: (text, timestamp) => {
      // Add to history
      setTranscriptionHistory(prev => [
        ...prev,
        { text, timestamp: timestamp || Date.now() }
      ].slice(-10)); // Keep last 10 transcriptions
      
      // Call parent callback if provided
      onTranscription?.(text);
    },
    onError: (errorMsg) => {
      console.error('STT Error:', errorMsg);
    }
  });

  // Auto-connect on mount
  useEffect(() => {
    connect().catch(console.error);
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const getStatusColor = () => {
    switch (status) {
      case STTStatus.CONNECTED: return 'text-green-600';
      case STTStatus.LISTENING: return 'text-blue-600';
      case STTStatus.PROCESSING: return 'text-yellow-600';
      case STTStatus.ERROR: return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case STTStatus.DISCONNECTED: return 'Disconnected';
      case STTStatus.CONNECTING: return 'Connecting...';
      case STTStatus.CONNECTED: return 'Connected';
      case STTStatus.LISTENING: return 'Listening...';
      case STTStatus.PROCESSING: return 'Processing...';
      case STTStatus.ERROR: return 'Error';
      default: return 'Unknown';
    }
  };

  const handleLanguageChange = (language: string) => {
    updateConfig({ language });
  };

  if (!isVisible) {
    return (
      <div className={`fixed bottom-4 right-4 ${className}`}>
        <button
          onClick={() => setIsVisible(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
          title="Open STT Demo"
        >
          🎤
        </button>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">Speech-to-Text Demo</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      {/* Status */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Status:</span>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 ml-2"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center gap-2 mt-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-600">
            {isConnected ? 'Connected to STT service' : 'Not connected'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={connect}
            disabled={isConnected}
            className="px-3 py-2 text-sm bg-green-600 text-white rounded disabled:bg-gray-300 hover:bg-green-700 transition-colors"
          >
            Connect
          </button>
          <button
            onClick={disconnect}
            disabled={!isConnected}
            className="px-3 py-2 text-sm bg-red-600 text-white rounded disabled:bg-gray-300 hover:bg-red-700 transition-colors"
          >
            Disconnect
          </button>
        </div>

        {/* Recording Controls */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={toggleRecording}
            disabled={!isConnected}
            className={`flex-1 px-4 py-3 rounded font-medium transition-colors ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300'
            }`}
          >
            {isRecording ? '🛑 Stop Recording' : '🎤 Start Recording'}
          </button>
        </div>

        {/* Language Selection */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Language:</label>
          <select
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="flex-1 px-2 py-1 border rounded text-sm"
            defaultValue="en"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="hi">Hindi</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
      </div>

      {/* Current Transcription */}
      {lastTranscription && (
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium mb-2">Latest Transcription:</h4>
          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm">
            {lastTranscription}
          </div>
        </div>
      )}

      {/* Transcription History */}
      <div className="p-4 max-h-64 overflow-y-auto">
        <h4 className="text-sm font-medium mb-2">History:</h4>
        {transcriptionHistory.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            No transcriptions yet. Click "Start Recording" to begin.
          </div>
        ) : (
          <div className="space-y-2">
            {transcriptionHistory.map((item, index) => (
              <div
                key={index}
                className="p-2 bg-gray-50 border border-gray-200 rounded text-sm"
              >
                <div className="font-medium text-gray-800">{item.text}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="p-4 bg-gray-50 text-xs text-gray-600 rounded-b-lg">
        <p>
          <strong>Instructions:</strong> Click "Start Recording" and speak into your microphone. 
          The system will automatically detect when you stop speaking and transcribe your speech.
        </p>
      </div>
    </div>
  );
}