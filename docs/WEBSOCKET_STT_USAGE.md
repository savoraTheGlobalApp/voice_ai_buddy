# WebSocket STT Integration - Usage Guide

This document explains how to use the newly integrated WebSocket Speech-to-Text functionality in the Voice AI Buddy app.

## Overview

The app now supports two STT modes:
1. **Legacy STT Mode** - Uses Web Speech API (browser-based)
2. **WebSocket STT Mode** - Uses OpenAI Whisper API via WebSocket (NEW)

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable WebSocket STT mode
NEXT_PUBLIC_USE_STT_WEBSOCKET=true

# WebSocket URL (default points to local backend)
NEXT_PUBLIC_STT_WEBSOCKET_URL=ws://localhost:8000/ws/stt

# STT Configuration
NEXT_PUBLIC_STT_LANGUAGE=en
NEXT_PUBLIC_STT_SILENCE_THRESHOLD=30
NEXT_PUBLIC_STT_MAX_RECORDING_TIME=30000
NEXT_PUBLIC_STT_AUTO_CONNECT=true
```

### Enable STT Mode

Make sure STT mode is enabled:
```bash
NEXT_PUBLIC_USE_STT_MODE=ON
```

## How It Works

### 1. Automatic Integration
When both `NEXT_PUBLIC_USE_STT_MODE=ON` and `NEXT_PUBLIC_USE_STT_WEBSOCKET=true` are set:
- The app will show WebSocket STT controls in the UI
- Voice transcriptions will be processed through OpenAI Whisper
- Transcribed text is automatically sent to the AI for response generation

### 2. UI Controls
The app displays a WebSocket STT control panel with:
- **Status Indicator**: Shows connection status (Connected, Listening, Processing, etc.)
- **Connect STT Button**: Establishes WebSocket connection
- **Record/Stop Button**: Controls voice recording
- **Disconnect Button**: Closes WebSocket connection
- **Error Display**: Shows any STT errors
- **Last Transcription**: Shows the most recent transcription

### 3. Workflow
1. User clicks "Connect STT" to establish WebSocket connection
2. User clicks "🎤 Record" to start voice recording
3. User speaks into microphone
4. System automatically detects silence and stops recording
5. Audio is sent to OpenAI Whisper API for transcription
6. Transcribed text is sent to AI for response generation
7. AI response is converted to speech and played back

## Backend Requirements

### Prerequisites
1. **Backend server running** on port 8000
2. **OpenAI API key** configured in backend environment
3. **WebSocket endpoint** available at `/ws/stt`

### Start Backend
```bash
cd backend
source venv/bin/activate  # or activate your virtual environment
python main.py
```

### Verify Backend
```bash
# Test backend health
curl http://localhost:8000/health

# Test WebSocket connection (requires wscat)
wscat -c ws://localhost:8000/ws/stt
```

## Usage Examples

### Basic Usage
1. Set environment variables in `.env`
2. Start backend server
3. Start frontend: `npm run dev`
4. Navigate to the app
5. Click "Connect" to start the voice session
6. Use WebSocket STT controls for voice input

### Programmatic Usage
You can also use the STT hook directly in your components:

```typescript
import { useSTT, STTStatus } from '@/lib/hooks/useSTT';

function MyComponent() {
  const {
    status,
    isConnected,
    isRecording,
    lastTranscription,
    error,
    connect,
    startRecording,
    stopRecording,
  } = useSTT({
    config: {
      language: 'en',
      silenceThreshold: 30,
      maxRecordingTime: 30000,
    },
    autoConnect: true,
    onTranscription: (text) => {
      console.log('Received transcription:', text);
      // Process the text
    },
  });

  return (
    <div>
      <div>Status: {status}</div>
      <button onClick={connect} disabled={isConnected}>
        Connect
      </button>
      <button 
        onClick={isRecording ? stopRecording : startRecording}
        disabled={!isConnected}
      >
        {isRecording ? 'Stop' : 'Start'} Recording
      </button>
      {lastTranscription && <p>Last: {lastTranscription}</p>}
      {error && <p style={{color: 'red'}}>Error: {error}</p>}
    </div>
  );
}
```

## Troubleshooting

### Common Issues

1. **"WebSocket connection failed"**
   - Check if backend is running on port 8000
   - Verify CORS configuration allows frontend origin
   - Check firewall settings

2. **"STT Error: OpenAI API key not set"**
   - Add `OPENAI_API_KEY` to backend `.env` file
   - Restart backend server

3. **"Microphone access denied"**
   - Grant microphone permissions in browser
   - Check browser security settings
   - Try different browser

4. **"No transcription received"**
   - Speak louder or closer to microphone
   - Check microphone is working in other apps
   - Try adjusting `silenceThreshold` setting

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will show additional debug information in browser console.

### Test Backend STT

Run the backend test script:
```bash
cd backend
python test_stt.py
```

## Performance Tips

1. **Optimize Recording Settings**
   - Lower `maxRecordingTime` for faster responses
   - Adjust `silenceThreshold` based on environment noise
   - Use appropriate `language` setting

2. **Network Optimization**
   - Use WebSocket connection pooling for high traffic
   - Consider using a CDN for frontend deployment
   - Monitor WebSocket connection health

3. **Audio Quality**
   - Use external microphone for better quality
   - Record in quiet environment
   - Check browser audio settings

## Migration from Legacy STT

To migrate from Web Speech API to WebSocket STT:

1. **Update Environment Variables**
   ```bash
   # Old setting
   NEXT_PUBLIC_USE_STT_MODE=ON
   
   # New settings
   NEXT_PUBLIC_USE_STT_MODE=ON
   NEXT_PUBLIC_USE_STT_WEBSOCKET=true
   ```

2. **Test Both Modes**
   - Test with `NEXT_PUBLIC_USE_STT_WEBSOCKET=false` (legacy)
   - Test with `NEXT_PUBLIC_USE_STT_WEBSOCKET=true` (new)

3. **Monitor Performance**
   - Compare transcription accuracy
   - Check response times
   - Monitor API costs

## Security Considerations

1. **API Key Protection**
   - Never expose OpenAI API key in frontend
   - Keep API key in backend environment only

2. **Audio Privacy**
   - Audio data is not stored on servers
   - WebSocket connections are ephemeral
   - Consider data retention policies

3. **Network Security**
   - Use HTTPS/WSS in production
   - Implement proper CORS policies
   - Monitor for unusual traffic patterns

## Cost Optimization

WebSocket STT uses OpenAI Whisper API which is:
- **More accurate** than Web Speech API
- **More expensive** than Web Speech API
- **Billed per audio second**

To optimize costs:
1. Use shorter recording segments
2. Implement proper silence detection
3. Monitor usage in OpenAI dashboard
4. Consider caching for repeated phrases

## Next Steps

1. **Test the integration** with your specific use case
2. **Monitor performance** and adjust settings as needed
3. **Implement error handling** for production use
4. **Consider adding features** like:
   - Multiple language support
   - Custom vocabulary
   - Real-time transcription display
   - Audio preprocessing