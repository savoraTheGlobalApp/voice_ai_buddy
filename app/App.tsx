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
    name: 'Assistant',
    instructions: 'You are a helpful assistant.',
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
      // Sanity check: trigger a short greeting to test output
      session.transport.sendMessage('Hello! I am ready. What would you like to do?', {});
    });
    session.transport.on('disconnected', () => console.log('[realtime] disconnected'));
    session.transport.on('error', (e: any) => console.error('[realtime] error', e));
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
        output: { voice: 'verse' },
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
        style={{ padding: '12px 20px', fontSize: 16 }}
      >
        Connect Realtime
      </button>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
      <div style={{ fontSize: 12, color: '#666' }}>Status: {status}</div>
      <div style={{ fontSize: 12, color: '#666', maxWidth: 480, textAlign: 'center' }}>
        Speak normally after connecting.
      </div>
    </main>
  );
}