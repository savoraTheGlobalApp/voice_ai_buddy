"use client";
import React, { useEffect, useRef, useState } from 'react';
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';

let currentSession: RealtimeSession | null = null;

export async function setupCounter(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
) {

  const agent = new RealtimeAgent({
    name: 'SocraticTutor',
    instructions: `You are a warm, friendly Socratic tutor for Indian children aged 3-10 years. You are like a wise friend 
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
    - Age 3-10 appropriate throughout`,
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
      // Only log if there's actual error information to avoid noise from empty error objects
      if (e && (e.error || e.message || typeof e === 'string' || Object.keys(e).length > 0)) {
        console.error('[realtime] error', e);
      }
      // Silently ignore empty error objects that don't provide useful information
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

export default function Page() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState('idle');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);

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
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>Mic:</label>
        <select
          value={selectedInput ?? ''}
          onChange={(e) => setSelectedInput(e.target.value)}
          style={{ fontSize: 12 }}
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
        {status === 'connecting...' ? 'Connecting...' : status === 'connected' ? '✓ Connected' : status === 'error - see console' ? '⚠ Try Again' : 'Connect Realtime'}
      </button>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
      <div style={{ fontSize: 12, color: '#666' }}>Status: {status}</div>
      <div style={{ fontSize: 12, color: '#666', maxWidth: 480, textAlign: 'center' }}>
        Speak normally after connecting.
      </div>
    </main>
  );
}