# Streaming TTS Implementation Changes

This document summarizes the changes made to convert the Text-to-Speech (TTS) architecture from a blocking blob-based approach to a low-latency streaming approach using OpenAI's API.

## 1. Backend Changes (`backend/main.py`)

### New Imports
Added `StreamingResponse` to handle chunked audio transfer.
```python
from fastapi.responses import Response, StreamingResponse
```

### New Generator Function
Added `_stream_openai_tts` to yield audio chunks from OpenAI's API instead of waiting for the full response.
```python
async def _stream_openai_tts(text: str, voice: str = "nova"):
    """
    Generator that yields chunks of audio data from OpenAI TTS API.
    """
    # ... (API key validation) ...
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/audio/speech",
            # ... (headers and body) ...
        ) as response:
            # ... (error handling) ...
            async for chunk in response.aiter_bytes():
                yield chunk
```

### New Streaming Endpoint
Added `GET /api/tts/stream` to expose the streaming functionality.
```python
@app.get("/api/tts/stream")
async def text_to_speech_stream(text: str, voice: str = "nova"):
    return StreamingResponse(
        _stream_openai_tts(text, voice),
        media_type="audio/mpeg"
    )
```

## 2. Frontend Changes (`app/App.tsx`)

### Updated `textToSpeech` Function
Refactored the function to use the new streaming endpoint directly in the `audio` element's `src` attribute, rather than fetching a blob.

**Key Changes:**
1.  Constructs a streaming URL: `${backendUrl}/api/tts/stream?text=...`
2.  Sets `audioEl.src = streamUrl` immediately.
3.  Removed the `fetch` -> `blob` -> `URL.createObjectURL` flow.
4.  Added logic to handle Android Chrome's specific audio requirements (pausing previous audio, resuming AudioContext).

```typescript
// New Implementation
const streamUrl = `${backendUrl}/api/tts/stream?text=${encodeURIComponent(text)}&voice=nova`;

if (audioEl) {
  // ... (cleanup previous audio) ...
  
  // Set up new audio source directly to the stream URL
  audioEl.src = streamUrl;
  audioEl.preload = 'auto';
  
  // Play immediately
  try {
    await audioEl.play();
  } catch (e) {
    // ... (retry logic) ...
  }
}
```

### Cleanup
Removed dead code related to the old blob-based implementation to fix lint errors and keep the codebase clean.
