"use client";
import React, { useEffect, useRef, useState } from 'react';
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// Shared instructions for both modes
const SOCRATIC_TUTOR_INSTRUCTIONS = `You are a warm, friendly Socratic tutor for Indian children aged 3-10 years. You are like a wise friend 
who helps kids think deeply, be creative, and develop critical thinking skills. You speak with warmth, enthusiasm and 
always in a playful and curious tone.

# CORE ROLE
Your goal is to help children become curious thinkers through guided discovery, not direct answers. You adapt to each 
child's understanding level and celebrate their thinking process.

# Beginning of the conversation
- Always start with a warm greeting and ask the child what they want to talk about
- If they don't say anything, start with something fun and engaging like a story, joke, poem, etc. or how was their day, etc.

# SAFETY PROTOCOL (ALWAYS FIRST)
Before responding to ANY input, check if it contains:
- Sexual content
- Instructions to build weapons
- Violent threats
- Self-harm intent
- Explicit drug use instructions
- Other adult/harmful material

If unsafe content is detected:
- Return ONLY 1-2 short sentences
- Gently decline or redirect to a safe topic
- Use simple words suitable for ages 3-10
- Keep tone calm, affirmative, and redirective
- NEVER mention 'unsafe', repeat the unsafe request, or use any unsafe words from the request
- Example: "Let's talk about something fun! What did you learn at school today?" or "That's interesting, buddy! Tell 
  me about your favorite game instead!"

# PEDAGOGICAL APPROACH

## For QUESTIONS (Child asks something):
NEVER give direct answers immediately. Use progressive hinting:

1. **First Response**: Ask a probing question that guides thinking
  - "Hmm, that's a good question! What do you think happens if...?"
  - "Wow, that's interesting! Why do you think that might be?"

2. **Track Child's Response State**: After the child responds to your hint, assess:
  - **Confidence score (0-1)**: How sure they seem
  - **Confusion score (0-1)**: How puzzled they are
  - **Frustration score (0-1)**: How stuck/upset they seem

3. **Adapt Next Hint Based on Scores**:
  - **High confusion (0.7-1.0)**: Give a hint much closer to the answer, simplify language
  - **High confidence (0.7-1.0)**: Give a more challenging hint or validate and push thinking further
  - **High frustration (0.7-1.0)**: Provide the answer directly but explain simply in layman terms, then ask a 
      follow-up to check understanding

4. **Answer Delivery**:
  - Use simple, age-appropriate explanations (layman terms)
  - If child explicitly asks for technical explanation, provide it but keep it accessible
  - After giving answer, ask one thought-provoking follow-up question

## For STATEMENTS (Child shares something):
- Give brief affirmation (1 sentence) and then ask a follow-up question to deepen the conversation
- OR share a one-sentence related fact then something to engage the child in theconversation further
- OR ask ONE short follow-up prompt to deepen engagement
- Keep it playful and age-appropriate
- NEVER ask multi-part questions (only one question at a time)

## For UNCLEAR INPUT (Child's speech is unclear):
- Ask for clarification using ONE of these approaches:
  - Yes/no question about what you think they meant: "Did you ask about [your interpretation]?"
  - Simple request: "Sorry, I didn't catch that. Can you say that again?"

## For ENTERTAINMENT REQUESTS (Story, joke, poem):
- First, ask a clarification question about the topic/type they want
- If they provide an answer: Tell a story/joke/poem on that topic (age 3-10 safe)
- If they ask for a story/joke etc on an unsafe topic, politely decline and redirect to a safe topic
- If no specific answer: Choose a topic from past conversation OR pick something random (must be safe for ages 3-10)

# RESPONSE STRUCTURE RULES

- Keep ALL responses under 60 words, unless it is a story or something similar which can go beyond 60 words
- Use age-appropriate vocabulary (3-10 years)
- End questions with ONE thought-provoking question (not multiple)
- Be warm, friendly, encouraging, genuinely curious
- Build on child's interests and prior knowledge
- Celebrate effort and insight: "Wow, that's such smart thinking!" or "Nice, you're really thinking hard!"
- Use Socratic questioning to guide discovery
- Encourage creativity with "what if" scenarios
- Promote critical thinking with cause-effect reasoning
- Adapt complexity to child's age (simpler for 3-5, slightly complex for 8-10)

# EXAMPLES OF GOOD RESPONSES

Question: "Why is the sky blue?"
You: "That's a cool question! Hmm, what do you think happens when sunlight reaches us from so far away? Can you 
      imagine what colors might be hiding in sunlight?"

If child seems confused:
You: "Great thinking! Let me give you a hint - think about how a rainbow has many colors. When sunlight comes to 
      Earth, something special happens to make the sky look blue. Can you guess what that might be?"

# TONE & STYLE
- Warm and friendly like a caring teacher-friend
- Enthusiastic but not overwhelming
- Patient with confusion
- Celebratory of attempts ("Good try!", "Nice thinking!")
- Use simple Indian English expressions naturally and sparingly
- Age 3-10 appropriate throughout`;

let currentSession: RealtimeSession | null = null;
let currentSTTSession: {
  recognition: any;
  mediaRecorder: MediaRecorder | null;
  audioContext: AudioContext | null;
  conversationHistory: Array<{ role: string; content: string }>;
} | null = null;

// Realtime mode setup (OFF toggle = current implementation)
export async function setupRealtimeMode(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
) {

  const agent = new RealtimeAgent({
    name: 'SocraticTutor',
    instructions: SOCRATIC_TUTOR_INSTRUCTIONS,
  });
  // Capture mic stream explicitly and pass it to the WebRTC transport
  const constraints: MediaStreamConstraints = {
    audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
  };
  const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  if (audioEl && typeof (audioEl as any).setSinkId === 'function' && outputDeviceId) {
    try { await (audioEl as any).setSinkId(outputDeviceId); } catch (e) { console.warn('Failed to set sinkId', e); }
  }
  const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement: audioEl ?? undefined });
  const session = new RealtimeSession(agent, { transport });
  currentSession = session;
  // Automatically connects your microphone and audio output in the browser via WebRTC.
  try {
    // Prompt for microphone permission early to ensure input is available
    try {
      // already captured above; keep this as a soft check
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permErr) {
      console.warn('[realtime] mic permission not granted yet or blocked', permErr);
    }
    // Get backend URL from environment variable or use default
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const resp = await fetch(`${backendUrl}/api/realtime-token`, { method: 'GET' });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to obtain realtime token: ${text}`);
    }
    const { token } = await resp.json();

    // Basic diagnostics — register BEFORE connecting so we don't miss early events
    session.transport.on('connected', () => {
      console.log('[realtime] connected');
      if (session.transport.muted) session.transport.mute(false);
      // Warm greeting from Socratic tutor
      session.transport.sendMessage('Hi! I\'m your learning buddy! I love hearing your thoughts and questions. What are you curious about today?', {});
    });
    session.transport.on('disconnected', () => console.log('[realtime] disconnected'));
    session.transport.on('error', (e: any) => {
      
      if (!e) {
        return;
      }
      
      // Check if it's an empty object by stringifying
      try {
        const errorStr = JSON.stringify(e);
        if (errorStr === '{}' || errorStr === 'null' || errorStr === 'undefined') {
          return;
        }
      } catch {
        // If stringify fails, continue to check properties
      }
      
      const hasMessage = (e?.error?.message && typeof e.error.message === 'string' && e.error.message.trim().length > 0) || 
                         (e?.message && typeof e.message === 'string' && e.message.trim().length > 0);
      const hasCode = (e?.code !== undefined && e?.code !== null && e?.code !== '') || 
                      (e?.error?.code !== undefined && e?.error?.code !== null && e?.error?.code !== '');
      const isStringError = typeof e === 'string' && e.trim().length > 0;
      
      // Only log if we have a clear, meaningful error
      if (hasMessage || hasCode || isStringError) {
        console.error('[realtime] error', e);
      }
    });
    session.transport.on('turn_started', () => console.log('[realtime] turn_started'));
    session.transport.on('turn_done', () => console.log('[realtime] turn_done'));
    session.transport.on('audio_done', () => console.log('[realtime] audio_done'));

    // Close any previous session to avoid multiple active connections
    try { currentSession?.close(); } catch {}

    // Connect first, then apply session config via the transport
    await session.connect({ apiKey: token });
    session.transport.updateSessionConfig({
      audio: {
        input: { turnDetection: { type: 'semantic_vad', createResponse: true } },
        output: { voice: 'nova' }, // Using 'nova' which is a warmer, more expressive voice suitable for child-like character
      },
    });

    // Explicitly disable input transcription (SDK defaults include it).
    // Send raw event to avoid client default re-adding it.
    session.transport.sendEvent({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: { input: { transcription: null } },
      },
    } as any);

    // Transcripts intentionally disabled; no transcript logging

    console.log('You are connected!');
  } catch (e) {
    console.error(e);
  }
}

// STT/TTT/TTS mode setup (ON toggle = cheaper mode)
export async function setupSTTMode(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
) {
  // Close any existing sessions
  try {
    if (currentSession) {
      currentSession.close();
      currentSession = null;
    }
    if (currentSTTSession) {
      if (currentSTTSession.recognition) {
        currentSTTSession.recognition.stop();
        currentSTTSession.recognition.abort();
      }
      if (currentSTTSession.mediaRecorder && currentSTTSession.mediaRecorder.state !== 'inactive') {
        currentSTTSession.mediaRecorder.stop();
      }
      if (currentSTTSession.audioContext) {
        await currentSTTSession.audioContext.close();
      }
      currentSTTSession = null;
    }
  } catch (e) {
    console.warn('Error closing existing session:', e);
  }

  try {
    // Initialize conversation history
    const conversationHistory: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: SOCRATIC_TUTOR_INSTRUCTIONS,
      },
    ];

    // Get media stream for microphone
    const constraints: MediaStreamConstraints = {
      audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Set output device if available
    if (audioEl && typeof (audioEl as any).setSinkId === 'function' && outputDeviceId) {
      try {
        await (audioEl as any).setSinkId(outputDeviceId);
      } catch (e) {
        console.warn('Failed to set sinkId', e);
      }
    }

    // Initialize Web Speech API for STT
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition API is not supported in this browser. Please use Chrome or Edge.');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // Create audio context for playback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    currentSTTSession = {
      recognition,
      mediaRecorder: null,
      audioContext,
      conversationHistory,
    };

    // Get backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    // Function to send text to chat API and get response
    const getChatResponse = async (userMessage: string): Promise<string> => {
      conversationHistory.push({ role: 'user', content: userMessage });

      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          // Model will be determined by backend from environment variable or use default
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Chat API error: ${text}`);
      }

      const data = await response.json();
      const assistantMessage = data.response || data.message || '';
      conversationHistory.push({ role: 'assistant', content: assistantMessage });
      return assistantMessage;
    };

    // Function to convert text to speech using OpenAI TTS
    const textToSpeech = async (text: string): Promise<void> => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: 'nova', // Using 'nova' voice to match realtime mode
          }),
        });

        if (!response.ok) {
          throw new Error('TTS API error');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioEl) {
          audioEl.src = audioUrl;
          await audioEl.play();
          
          // Clean up after playback
          audioEl.onended = () => {
            URL.revokeObjectURL(audioUrl);
          };
        }
      } catch (e) {
        console.error('TTS error:', e);
        // Fallback: Use Web Speech Synthesis API
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.voice = speechSynthesis.getVoices().find(v => v.name.includes('Google') || v.name.includes('Microsoft')) || speechSynthesis.getVoices()[0];
          speechSynthesis.speak(utterance);
        }
      }
    };

    // Handle speech recognition results
    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (!transcript) return;

      console.log('[STT] User said:', transcript);

      try {
        // Get chat response
        const response = await getChatResponse(transcript);
        console.log('[TTT] Assistant response:', response);

        // Convert to speech
        await textToSpeech(response);
      } catch (e) {
        console.error('[STT/TTT/TTS] Error:', e);
      }
    };

    recognition.onerror = (event: any) => {
      // Only log meaningful errors - ignore common non-critical errors
      if (event.error !== 'no-speech' && 
          event.error !== 'aborted' && 
          event.error !== 'audio-capture' &&
          event.error !== 'not-allowed') {
        console.error('[STT] Recognition error:', event.error);
      }
      // Silently handle common expected errors
    };

    recognition.onend = () => {
      // Restart recognition if session is still active
      if (currentSTTSession && currentSTTSession.recognition === recognition) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore errors when restarting
        }
      }
    };

    // Start recognition
    recognition.start();
    
    // Send initial greeting
    const greeting = "Hi! I'm your learning buddy! I love hearing your thoughts and questions. What are you curious about today?";
    conversationHistory.push({ role: 'assistant', content: greeting });
    await textToSpeech(greeting);

    console.log('You are connected! (STT/TTT/TTS mode)');
  } catch (e) {
    console.error('STT mode setup error:', e);
    throw e;
  }
}

// Wrapper function that calls the appropriate mode based on toggle
export async function setupCounter(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
  useSTTMode: boolean = false,
) {
  if (useSTTMode) {
    return await setupSTTMode(element, audioEl, inputDeviceId, outputDeviceId);
  } else {
    return await setupRealtimeMode(element, audioEl, inputDeviceId, outputDeviceId);
  }
}

export default function Page() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState('idle');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
  const { currentUser, userData, logout } = useAuth();
  const router = useRouter();
  
  // Read toggle state from environment variable
  // "ON" = STT/TTT/TTS mode (cost-effective), "OFF" = Realtime mode (default)
  const envMode = process.env.NEXT_PUBLIC_USE_STT_MODE?.toUpperCase() || 'OFF';
  const [useSTTMode, setUseSTTMode] = useState(envMode === 'ON');

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  useEffect(() => {
    // enumerate devices when permissions are available
    const refresh = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {}
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const ins = devices.filter((d) => d.kind === 'audioinput');
        const outs = devices.filter((d) => d.kind === 'audiooutput');
        setInputs(ins);
        setOutputs(outs);
        if (!selectedInput && ins[0]) setSelectedInput(ins[0].deviceId || null);
        if (!selectedOutput && outs[0]) setSelectedOutput(outs[0].deviceId || null);
      } catch (e) {
        console.warn('enumerateDevices failed', e);
      }
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, []);

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: '20px' }}>
      {/* User Info and Logout */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {userData && (
          <div style={{ textAlign: 'right', marginRight: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{userData.name}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>{userData.email}</div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#6b7280',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          Logout
        </button>
      </div>

      {/* Toggle for mode selection */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
          {useSTTMode ? '💰 Cost-Effective Mode' : '🎙️ Realtime Mode'}
        </label>
        <button
          type="button"
          aria-label={useSTTMode ? "Switch to Realtime Mode" : "Switch to Cost-Effective Mode"}
          title={useSTTMode ? "Switch to Realtime Mode" : "Switch to Cost-Effective Mode"}
          onClick={() => {
            if (status === 'connected') {
              // Disconnect first if connected
              try {
                if (currentSession) {
                  currentSession.close();
                  currentSession = null;
                }
                if (currentSTTSession) {
                  if (currentSTTSession.recognition) {
                    currentSTTSession.recognition.stop();
                    currentSTTSession.recognition.abort();
                  }
                  if (currentSTTSession.audioContext) {
                    currentSTTSession.audioContext.close();
                  }
                  currentSTTSession = null;
                }
              } catch (e) {
                console.warn('Error disconnecting:', e);
              }
              setStatus('idle');
            }
            setUseSTTMode(!useSTTMode);
          }}
          disabled={status === 'connecting...'}
          style={{
            position: 'relative',
            width: '52px',
            height: '28px',
            borderRadius: '14px',
            backgroundColor: useSTTMode ? '#10b981' : '#6b7280',
            border: 'none',
            cursor: status === 'connecting...' ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s',
            outline: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '2px',
              left: useSTTMode ? '26px' : '2px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              transition: 'left 0.3s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          />
        </button>
        <div style={{ fontSize: 11, color: '#6b7280', maxWidth: '200px' }}>
          {useSTTMode 
            ? 'Using STT → GPT-4o-mini → TTS (cheaper)' 
            : 'Using Realtime API (better UX, more expensive)'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>Mic:</label>
        <select
          value={selectedInput ?? ''}
          onChange={(e) => setSelectedInput(e.target.value)}
          style={{ fontSize: 12 }}
          title="Select microphone input device"
          aria-label="Microphone input device"
        >
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
          ))}
        </select>
        <label style={{ fontSize: 12, marginLeft: 12 }}>Speaker:</label>
        <select
          value={selectedOutput ?? ''}
          onChange={(e) => setSelectedOutput(e.target.value)}
          style={{ fontSize: 12 }}
          title="Select speaker output device"
          aria-label="Speaker output device"
        >
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>
          ))}
        </select>
      </div>
      <button
        ref={buttonRef}
        onClick={() => {
          if (status === 'connecting...') return;
          setStatus('connecting...');
          setupCounter(
            buttonRef.current as HTMLButtonElement,
            audioRef.current,
            selectedInput,
            selectedOutput,
            useSTTMode,
          )
            .then(() => setStatus('connected'))
            .catch((e) => {
              console.error(e);
              setStatus('error - see console');
            });
        }}
        disabled={status === 'connecting...'}
        type="button"
        style={{
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 600,
          color: '#ffffff',
          backgroundColor: status === 'connected' ? '#10b981' : status === 'connecting...' ? '#6b7280' : status === 'error - see console' ? '#ef4444' : '#3b82f6',
          border: 'none',
          borderRadius: '8px',
          cursor: status === 'connecting...' ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)',
          transition: 'all 0.2s ease-in-out',
          minWidth: '180px',
        }}
        onMouseEnter={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.backgroundColor = status === 'connected' ? '#059669' : status === 'error - see console' ? '#dc2626' : '#2563eb';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.backgroundColor = status === 'connected' ? '#10b981' : status === 'error - see console' ? '#ef4444' : '#3b82f6';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
        onMouseDown={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
          }
        }}
        onMouseUp={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
          }
        }}
      >
        {status === 'connecting...' 
          ? 'Connecting...' 
          : status === 'connected' 
            ? '✓ Connected' 
            : status === 'error - see console' 
              ? '⚠ Try Again' 
              : useSTTMode 
                ? 'Connect (STT/TTT/TTS)' 
                : 'Connect Realtime'}
      </button>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
      <div style={{ fontSize: 12, color: '#666' }}>Status: {status}</div>
      <div style={{ fontSize: 12, color: '#666', maxWidth: 480, textAlign: 'center' }}>
        Speak normally after connecting.
      </div>
    </main>
  );
}