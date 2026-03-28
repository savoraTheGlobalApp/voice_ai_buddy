import { useState, useMemo, useEffect, useRef, useCallback, Component } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import WebView from 'react-native-webview';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useStaticStory } from '../../src/hooks/useStaticStories';
import { apiClient } from '../../src/api/client';
import RiveNarratorAvatar from '../../src/components/RiveNarratorAvatar';
import { COMPANION } from '../../src/config/companion';
import type { ThemeColors } from '../../src/theme/colors';
import {
  trackBaluScreenOpened,
  trackBaluSessionStarted,
  trackBaluSessionEnded,
  trackBaluModeSwitched,
} from '../../src/utils/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const VAPI_PUBLIC_KEY           = process.env.EXPO_PUBLIC_VAPI_KEY ?? '';
const VAPI_ASSISTANT_ID         = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID ?? '';
const VAPI_ASSISTANT_ID_V2      = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID_V2 ?? '';
const VAPI_STORY_ASSISTANT_ID   = process.env.EXPO_PUBLIC_VAPI_STORY_ASSISTANT_ID ?? '';
const SESSION_SECONDS        = 60 * 60; // fallback when daily quota unknown (1h)

type AssistantMode = 'classic' | 'learning';
const ASSISTANT_MODES: { key: AssistantMode; label: string; desc: string }[] = [
  { key: 'classic',  label: '📖 Stories',  desc: 'English storytelling'   },
  { key: 'learning', label: '🎉 Fun',      desc: 'Games & chat'           },
];

// ── Avatar error boundary ─────────────────────────────────────────────────────
class AvatarErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(e: Error) { console.error('[BaluAvatar] crash:', e.message); }
  render() { return this.state.crashed ? this.props.fallback : this.props.children; }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type CallStatus =
  | 'idle'               // landing — not yet started
  | 'requesting-permission'
  | 'permission-denied'
  | 'connecting'
  | 'active'
  | 'balu-speaking'
  | 'user-speaking'
  | 'thinking'
  | 'ended'
  | 'error';

const STATUS_LABELS: Record<CallStatus, string> = {
  'idle':                  `Say hi to ${COMPANION.name}!`,
  'requesting-permission': 'Checking microphone...',
  'permission-denied':     'Microphone access needed',
  'connecting':            `Connecting to ${COMPANION.name}...`,
  'active':                'Listening...',
  'balu-speaking':         `${COMPANION.name} is speaking...`,
  'user-speaking':         "I'm listening!",
  'thinking':              `${COMPANION.name} is thinking...`,
  'ended':                 `Goodbye! ${COMPANION.emoji}`,
  'error':                 'Something went wrong',
};

// ── Vapi WebView HTML ─────────────────────────────────────────────────────────
const VAPI_SDK_URL = 'https://res.cloudinary.com/dsqytt7ty/raw/upload/v1773051338/vapi-sdk/vapi.browser.js';

function buildBaluHtml(assistantId: string, uid: string, memory: string, childName: string, childAge: number, storyContext = '', firstMessage = '') { return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:transparent}</style></head>
<body>
<script>
  window.__VAPI_KEY__ = ${JSON.stringify(VAPI_PUBLIC_KEY)};
  window.__VAPI_ASSISTANT_ID__ = ${JSON.stringify(assistantId)};
  window.__USER_ID__ = ${JSON.stringify(uid)};
  window.__MEMORY__ = ${JSON.stringify(memory)};
  window.__CHILD_NAME__ = ${JSON.stringify(childName)};
  window.__CHILD_AGE__ = ${childAge || 0};
  window.__STORY_CONTEXT__ = ${JSON.stringify(storyContext)};
  window.__FIRST_MESSAGE__ = ${JSON.stringify(firstMessage)};
  function post(type, payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} })); } catch(e) {}
  }
  function initVapi() {
    try {
      var vapi = new window.Vapi(window.__VAPI_KEY__);
      var _callId = '';
      vapi.on('call-start', function() {
        // Try to grab call ID immediately; also poll briefly in case it populates async
        _callId = (vapi.call && vapi.call.id) ? vapi.call.id : '';
        setTimeout(function() {
          if (!_callId) _callId = (vapi.call && vapi.call.id) ? vapi.call.id : '';
        }, 2000);
        post('call-start', {});
      });
      vapi.on('call-end', function() {
        // By call-end the call object is always populated
        if (!_callId) _callId = (vapi.call && vapi.call.id) ? vapi.call.id : '';
        post('call-end', { call_id: _callId });
      });
      vapi.on('speech-start', function() { post('speech-start'); });
      vapi.on('speech-end',   function() { post('speech-end'); });
      vapi.on('error', function(e) { post('error', { message: e ? (e.message || e.errorMsg || JSON.stringify(e)) : 'unknown' }); });
      vapi.on('message', function(msg) {
        if (!msg) return;
        if (msg.type === 'transcript' && msg.transcriptType === 'partial') post('user-speech-start');
        if (msg.type === 'transcript' && msg.transcriptType === 'final')   post('user-speech-end', { transcript: msg.transcript });
      });
      var overrides = {
        variableValues: {
          uid: window.__USER_ID__,
          child_memory: window.__MEMORY__ || '',
          child_name: window.__CHILD_NAME__ || '',
          child_age: String(window.__CHILD_AGE__ || ''),
          story_context: window.__STORY_CONTEXT__ || ''
        }
      };
      if (window.__FIRST_MESSAGE__) overrides.firstMessage = window.__FIRST_MESSAGE__;
      vapi.start(window.__VAPI_ASSISTANT_ID__, overrides);
      function handleMsg(e) {
        try {
          var m = JSON.parse(e.data);
          if (m.type === 'stop')   vapi.stop();
          if (m.type === 'mute')   vapi.setMuted(true);
          if (m.type === 'unmute') vapi.setMuted(false);
        } catch(err) {}
      }
      document.addEventListener('message', handleMsg);
      window.addEventListener('message', handleMsg);
    } catch(e) { try { post('error', { message: 'Init: ' + JSON.stringify(e) }); } catch(_) { post('error', { message: 'Init failed (unserializable)' }); } }
  }
<\/script>
<script src="${VAPI_SDK_URL}" onload="initVapi()" onerror="post('error', { message: 'SDK load failed' })"></script>
</body>
</html>`; }

// ── DIY Voice Stack HTML ──────────────────────────────────────────────────────
const BACKEND_WS_URL = __DEV__
  ? 'ws://10.0.2.2:8000'
  : 'wss://voiceaibuddybackend-voiceaibuddy-pr-33.up.railway.app';
const BACKEND_HTTP_URL = __DEV__
  ? 'http://10.0.2.2:8000'
  : 'https://voiceaibuddybackend-voiceaibuddy-pr-33.up.railway.app';

function buildDiyBaluHtml(childName: string, childAge: number, memory: string) { return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:transparent}</style></head>
<body><script>
  var BACKEND_WS   = ${JSON.stringify(BACKEND_WS_URL)};
  var BACKEND_HTTP = ${JSON.stringify(BACKEND_HTTP_URL)};
  var CHILD_NAME   = ${JSON.stringify(childName || 'there')};
  var CHILD_AGE    = ${childAge || 5};
  var MEMORY       = ${JSON.stringify(memory || '')};

  var sttWs = null, ttsWs = null;
  var audioCtx = null, micStream = null, processor = null, silentGain = null;
  var nextPlayTime = 0;
  var isBaluSpeaking = false;
  var messages = [];
  var stopped = false;
  var pendingAudioCount = 0;
  var dgPlaybackDone = false;
  var speechTimeoutId = null;
  var totalQueuedDuration = 0;

  function post(type, payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} })); } catch(e) {}
  }

  function buildSystemPrompt() {
    var name = CHILD_NAME !== 'there' ? CHILD_NAME : 'a child';
    var prompt = 'You are Balu, a warm and friendly bear who loves talking with children. '
      + 'You are speaking with ' + name + ', who is ' + CHILD_AGE + ' years old. '
      + 'Keep every response to 1-3 short sentences. Use simple, fun words. Be enthusiastic!';
    if (MEMORY) prompt += ' What you know about this child: ' + MEMORY;
    return prompt;
  }

  function init() {
    messages = [{ role: 'system', content: buildSystemPrompt() }];
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    } catch(e) {
      post('error', { message: 'AudioContext: ' + e.message }); return;
    }

    // ── TTS WebSocket ──
    try {
      ttsWs = new WebSocket(BACKEND_WS + '/api/tts/deepgram');
      ttsWs.binaryType = 'arraybuffer';
      ttsWs.onopen = function() { console.log('[DIY] TTS connected'); };
      ttsWs.onmessage = onTTSMessage;
      ttsWs.onerror = function() { if (!stopped) post('error', { message: 'TTS connection failed' }); };
      ttsWs.onclose = function() { console.log('[DIY] TTS closed'); };
    } catch(e) { post('error', { message: 'TTS init: ' + e.message }); return; }

    // ── STT WebSocket ──
    try {
      sttWs = new WebSocket(BACKEND_WS + '/api/stt/deepgram');
      sttWs.binaryType = 'arraybuffer';
      sttWs.onopen = function() {
        console.log('[DIY] STT connected');
        post('call-start');
        startMic();
      };
      sttWs.onmessage = onSTTMessage;
      sttWs.onerror = function() { if (!stopped) post('error', { message: 'STT connection failed' }); };
      sttWs.onclose = function() { console.log('[DIY] STT closed'); };
    } catch(e) { post('error', { message: 'STT init: ' + e.message }); return; }
  }

  function startMic() {
    try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      post('error', { message: 'getUserMedia not available (check WebView origin)' }); return;
    }
    navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false })
      .then(function(stream) {
        micStream = stream;
        var source = audioCtx.createMediaStreamSource(stream);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        processor.onaudioprocess = function(e) {
          if (stopped) return;
          if (!sttWs || sttWs.readyState !== WebSocket.OPEN) return;
          var f32 = e.inputBuffer.getChannelData(0);
          var i16 = new Int16Array(f32.length);
          for (var i = 0; i < f32.length; i++) {
            i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
          }
          sttWs.send(i16.buffer);
        };
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);
      })
      .catch(function(e) { post('error', { message: 'Mic: ' + e.message }); });
    } catch(e) { post('error', { message: 'Mic init: ' + (e.message || e) }); }
  }

  function onSTTMessage(event) {
    try {
      var data = JSON.parse(event.data);
      if (data.type === 'transcript' && data.text && data.text.trim()) {
        if (isBaluSpeaking) return; // ignore echo while Balu is talking
        post('user-speech-start');
        post('user-speech-end', { transcript: data.text });
        messages.push({ role: 'user', content: data.text });
        callLLM();
      }
    } catch(e) {}
  }

  function onSpeechComplete() {
    if (stopped || !isBaluSpeaking) return;
    if (speechTimeoutId) { clearTimeout(speechTimeoutId); speechTimeoutId = null; }
    isBaluSpeaking = false;
    nextPlayTime = 0;
    pendingAudioCount = 0;
    dgPlaybackDone = false;
    post('speech-end');
  }

  function callLLM() {
    pendingAudioCount = 0;
    dgPlaybackDone = false;
    totalQueuedDuration = 0;
    isBaluSpeaking = true;
    post('speech-start');
    // Safety net: force speech-end after 25s if nothing else triggers it
    if (speechTimeoutId) clearTimeout(speechTimeoutId);
    speechTimeoutId = setTimeout(function() { onSpeechComplete(); }, 25000);
    var body = JSON.stringify({ messages: messages, model: 'gpt-4o-mini' });
    fetch(BACKEND_HTTP + '/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    }).then(function(response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var fullResponse = '';
      var sentenceBuf = '';
      function pump() {
        reader.read().then(function(result) {
          if (result.done) {
            if (sentenceBuf.trim()) sendToTTS(sentenceBuf.trim());
            if (ttsWs && ttsWs.readyState === WebSocket.OPEN) ttsWs.send(JSON.stringify({ type: 'flush' }));
            messages.push({ role: 'assistant', content: fullResponse });
            return;
          }
          var text = decoder.decode(result.value, { stream: true });
          var lines = text.split('\\n');
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('data: ') !== 0) continue;
            try {
              var chunk = JSON.parse(line.slice(6));
              if (chunk.delta) {
                fullResponse += chunk.delta;
                sentenceBuf += chunk.delta;
                if (/[.!?]/.test(sentenceBuf) && sentenceBuf.length > 8) {
                  sendToTTS(sentenceBuf.trim());
                  sentenceBuf = '';
                }
              }
              if (chunk.done) {
                if (sentenceBuf.trim()) sendToTTS(sentenceBuf.trim());
                if (ttsWs && ttsWs.readyState === WebSocket.OPEN) ttsWs.send(JSON.stringify({ type: 'flush' }));
                messages.push({ role: 'assistant', content: fullResponse });
                return;
              }
            } catch(e) {}
          }
          pump();
        }).catch(function(e) {
          post('error', { message: 'LLM read: ' + e.message });
          isBaluSpeaking = false;
          post('speech-end');
        });
      }
      pump();
    }).catch(function(e) {
      post('error', { message: 'LLM fetch: ' + e.message });
      isBaluSpeaking = false;
      post('speech-end');
    });
  }

  function sendToTTS(text) {
    if (ttsWs && ttsWs.readyState === WebSocket.OPEN) {
      ttsWs.send(JSON.stringify({ type: 'speak', text: text }));
    }
  }

  function onTTSMessage(event) {
    if (event.data instanceof ArrayBuffer) {
      playPCM(event.data);
    } else {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'playback_finished') {
          dgPlaybackDone = true;
          if (pendingAudioCount === 0) {
            onSpeechComplete();
          } else {
            // AudioContext may be suspended so onended may never fire.
            // Wait for expected audio duration + 600ms, then force complete.
            if (audioCtx.state === 'suspended') audioCtx.resume();
            var fallbackMs = Math.max(300, totalQueuedDuration * 1000 + 600);
            setTimeout(function() {
              if (isBaluSpeaking && dgPlaybackDone) onSpeechComplete();
            }, fallbackMs);
          }
        }
      } catch(e) {}
    }
  }

  function playPCM(buffer) {
    if (!audioCtx || stopped) return;
    var i16 = new Int16Array(buffer);
    if (i16.length === 0) return;
    var f32 = new Float32Array(i16.length);
    for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;
    try {
      var ab = audioCtx.createBuffer(1, f32.length, 48000);
      ab.getChannelData(0).set(f32);
      var src = audioCtx.createBufferSource();
      src.buffer = ab;
      src.connect(audioCtx.destination);
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = Math.max(audioCtx.currentTime + 0.05, nextPlayTime);
      totalQueuedDuration += ab.duration;
      pendingAudioCount++;
      src.onended = function() {
        pendingAudioCount--;
        if (pendingAudioCount === 0 && dgPlaybackDone) onSpeechComplete();
      };
      src.start(t);
      nextPlayTime = t + ab.duration;
    } catch(e) { console.warn('[DIY] playPCM error:', e); }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    try { if (sttWs) sttWs.close(); } catch(e) {}
    try { if (ttsWs) ttsWs.close(); } catch(e) {}
    try { if (micStream) micStream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
    try { if (processor) processor.disconnect(); } catch(e) {}
    try { if (silentGain) silentGain.disconnect(); } catch(e) {}
    try { if (audioCtx) audioCtx.close(); } catch(e) {}
    post('call-end', {});
  }

  function handleMsg(e) {
    try { var m = JSON.parse(e.data); if (m.type === 'stop') stop(); } catch(e) {}
  }
  document.addEventListener('message', handleMsg);
  window.addEventListener('message', handleMsg);

  init();
<\/script></body></html>`; }

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function BaluScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userData } = useAuth();
  const insets = useSafeAreaInsets();

  // Story mode — params injected when navigating from library
  const { storyId, storyTitle, storyCategory } = useLocalSearchParams<{
    storyId?: string; storyTitle?: string; storyCategory?: string;
  }>();
  const isStoryMode = !!storyId;
  const storyQuery = useStaticStory(storyId ?? '');

  const storyContext = useMemo(() => {
    if (!isStoryMode || !storyQuery.data) return '';
    const data = storyQuery.data as any;
    let parts = '';
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      // StaticStory format (maha-001 etc.)
      parts = data.segments
        .map((s: any, i: number) => `Part ${i + 1}${s.segmentType ? ` (${s.segmentType})` : ''}: ${s.narrative?.en ?? ''}${s.discussionQuestion ? `\nDiscussion question: ${s.discussionQuestion.en ?? ''}` : ''}`)
        .join('\n\n');
    } else if (Array.isArray(data.blocks) && data.blocks.length > 0) {
      // BlockBasedContent format (habits, emotions etc.)
      parts = data.blocks
        .map((b: any) => b.content?.en ?? b.question?.en ?? '')
        .filter(Boolean)
        .join('\n\n');
    }
    if (!parts) return '';
    return `Title: ${storyTitle}\nCategory: ${storyCategory}\n\n${parts}`;
  }, [isStoryMode, storyQuery.data, storyTitle, storyCategory]);

  // Calculate positions ONCE at mount — frozen forever, immune to layout shifts
  const avatarSize = SCREEN_WIDTH * 0.72;
  const avatarPos = useMemo(() => {
    const usable = SCREEN_HEIGHT - insets.top - insets.bottom - 72 - 190;
    const top = insets.top + 72 + Math.max(0, (usable - avatarSize) / 2);
    const left = (SCREEN_WIDTH - avatarSize) / 2;
    return { top, left };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps = calculate once only


  const [status, setStatus]                   = useState<CallStatus>('idle');
  const [micGranted, setMicGranted]           = useState(false);
  const [baluMemory, setBaluMemory]           = useState('');
  const [callActive, setCallActive]           = useState(false);
  const [secondsLeft, setSecondsLeft]         = useState(SESSION_SECONDS);
  const [errorMsg, setErrorMsg]               = useState('');
  const [dailyRemaining, setDailyRemaining]   = useState<number | null>(null);
  const [assistantMode, setAssistantMode]     = useState<AssistantMode>('learning'); // F02: default fun mode
  const [callMode, setCallMode]               = useState<'vapi' | 'diy'>('vapi');
  const [nativeDiyActive, setNativeDiyActive] = useState(false);
  const [debugLog, setDebugLog]               = useState<string[]>([]);
  const callStartTimeRef                       = useRef<number>(0);
  const callIdRef                              = useRef<string>('');
  const webViewRef = useRef<WebView>(null);

  // ── Native DIY refs ─────────────────────────────────────────────────────────
  const diyRunning      = useRef(false);
  const diyMessages     = useRef<{ role: string; content: string }[]>([]);
  const diyRecording    = useRef<Audio.Recording | null>(null);
  const diyHasSpeech    = useRef(false);
  const diySilenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diyAuthToken    = useRef<string | null>(null);
  const diyStopPromise  = useRef<Promise<unknown>>(Promise.resolve());
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);

  // Idle breathing animation for the avatar ring
  const idleGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(idleGlow, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(idleGlow, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const glowOpacity = idleGlow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.22] });
  const glowScale   = idleGlow.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] });

  // ── Track screen open ───────────────────────────────────────────────────────
  useEffect(() => {
    trackBaluScreenOpened(assistantMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset state when story params change (tab stays mounted between navigations) ──
  const prevStoryIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (storyId === prevStoryIdRef.current) return;
    prevStoryIdRef.current = storyId;
    // End any active call so the WebView doesn't receive a new source mid-call
    if (callActive) {
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({type:'stop'}) })); true;`
      );
      setCallActive(false);
    }
    if (nativeDiyActive) {
      diyRunning.current = false;
      setNativeDiyActive(false);
    }
    setStatus('idle');
    setErrorMsg('');
    setSecondsLeft(SESSION_SECONDS);
    autoStartedRef.current = false;
  }, [storyId]);

  // ── F17: Auto-start call when entering story mode ───────────────────────────
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!isStoryMode) return;
    if (autoStartedRef.current) return;
    if (storyQuery.isLoading || storyQuery.isError) return;
    if (callActive || nativeDiyActive) return;
    if (status !== 'idle') return;
    autoStartedRef.current = true;
    startConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoryMode, storyQuery.isLoading, storyQuery.isError, callActive, nativeDiyActive, status]);

  // ── Fetch daily remaining + memory on mount ─────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    apiClient<{ seconds_remaining: number }>('/api/vapi/remaining')
      .then(r => setDailyRemaining(r.seconds_remaining))
      .catch(() => setDailyRemaining(SESSION_SECONDS)); // fail open
    apiClient<{ memory: string; has_memory: boolean }>('/api/balu/memory')
      .then(r => { if (r.has_memory) setBaluMemory(r.memory); })
      .catch(() => {}); // fail silently — memory is best-effort
  }, [currentUser]);

  // ── Record usage when call ends ─────────────────────────────────────────────
  const recordUsage = useCallback((startTime: number) => {
    const used = Math.round((Date.now() - startTime) / 1000);
    if (used <= 0 || !currentUser) return;
    apiClient('/api/vapi/record', {
      method: 'POST',
      body: JSON.stringify({
        seconds_used: used,
        call_id: callIdRef.current,
        assistant_mode: assistantMode,
      }),
    }).then(() => {
      setDailyRemaining(prev => prev !== null ? Math.max(0, prev - used) : null);
    }).catch(() => {});
  }, [currentUser]);

  // ── Start conversation ──────────────────────────────────────────────────────
  const startConversation = useCallback(async () => {
    if (dailyRemaining !== null && dailyRemaining <= 0) {
      Alert.alert("Daily limit reached", `You've used all your ${COMPANION.name} time for today. Come back tomorrow!`);
      return;
    }
    // F10: no per-session limit — session runs until daily quota exhausted
    const sessionCap = dailyRemaining !== null ? dailyRemaining : SESSION_SECONDS;
    setSecondsLeft(sessionCap);

    // Ensure mic permission
    let hasPermission = micGranted;
    if (!hasPermission) {
      setStatus('requesting-permission');
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setStatus('permission-denied');
        Alert.alert(
          'Microphone Access Needed',
          `To talk with ${COMPANION.name}, please allow microphone access in your device settings.`,
          [{ text: 'OK', onPress: () => setStatus('idle') }]
        );
        return;
      }
      setMicGranted(true);
      hasPermission = true;
    }

    if (callMode === 'diy') {
      startNativeDiy();
      return;
    }

    // Vapi path
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
    callStartTimeRef.current = Date.now();
    apiClient('/api/vapi/register-call', {
      method: 'POST',
      body: JSON.stringify({ assistant_mode: assistantMode }),
    }).catch(() => {});
    setCallActive(true);
    setStatus('connecting');
    trackBaluSessionStarted(assistantMode);
  }, [micGranted, dailyRemaining, callMode, startNativeDiy, assistantMode]);

  // ── End conversation → return to idle ──────────────────────────────────────
  const endCall = useCallback((reason: 'user' | 'timer' | 'error' = 'user') => {
    if (nativeDiyActive) {
      stopNativeDiy();
      return;
    }
    if (callStartTimeRef.current > 0) {
      const durationSeconds = Math.round((Date.now() - callStartTimeRef.current) / 1000);
      recordUsage(callStartTimeRef.current);
      callStartTimeRef.current = 0;
      trackBaluSessionEnded(assistantMode, durationSeconds, reason);
    }
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'stop' }) })); true;`
    );
    setCallActive(false);
    setSecondsLeft(SESSION_SECONDS);
    setStatus('idle');
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
  }, [recordUsage, assistantMode, nativeDiyActive, stopNativeDiy]);

  // ── Native DIY functions ────────────────────────────────────────────────────
  const diyBackendUrl = BACKEND_HTTP_URL;
  const dlog = useCallback((msg: string) => {
    console.log('[DIY]', msg);
    setDebugLog(prev => [...prev.slice(-6), msg]);
  }, []);

  const diySystemPrompt = useCallback(() => {
    const name = userData?.name || 'there';
    let prompt = `You are Balu, a warm and friendly bear who loves talking with children. You are speaking with ${name}, who is ${userData?.age || 5} years old. Keep every response to 1-3 short sentences. Use simple, fun words. Be enthusiastic!`;
    if (baluMemory) prompt += ` What you know about this child: ${baluMemory}`;
    if (storyContext) prompt += `\n\n${storyContext}`;
    return prompt;
  }, [userData, baluMemory, storyContext]);

  const diyStopRecording = useCallback(() => {
    if (diySilenceTimer.current) { clearTimeout(diySilenceTimer.current); diySilenceTimer.current = null; }
    if (diyRecording.current) {
      const rec = diyRecording.current;
      diyRecording.current = null;
      // Save the stop promise so diyStartRecording can await it
      diyStopPromise.current = rec.stopAndUnloadAsync().catch(() => {});
    }
  }, []);

  const diyStartRecording = useCallback(async () => {
    if (!diyRunning.current) return;
    diyHasSpeech.current = false;
    // Wait for any previous recording to fully release the Android mic
    await diyStopPromise.current;
    if (!diyRunning.current) return; // session may have ended while waiting
    dlog('mic: preparing...');
    setStatus('active');
    try {
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        android: {
          extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
        },
        ios: {
          extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
        },
        web: {},
        isMeteringEnabled: true,
      });
      // interval BEFORE startAsync — some Android devices need this to enable metering
      rec.setProgressUpdateInterval(100);
      // Set ref BEFORE startAsync so the status callback always sees it
      diyRecording.current = rec;
      let firstCb = true;
      rec.setOnRecordingStatusUpdate((s) => {
        if (firstCb) { firstCb = false; dlog(`cb1: isRec=${s.isRecording} db=${s.metering?.toFixed(0) ?? 'null'}`); }
        if (!diyRunning.current || !s.isRecording) return;
        const db = s.metering ?? -160;
        if (db > -40) {
          if (!diyHasSpeech.current) dlog(`speech! db=${db.toFixed(0)}`);
          diyHasSpeech.current = true;
          setStatus('user-speaking');
          if (diySilenceTimer.current) { clearTimeout(diySilenceTimer.current); diySilenceTimer.current = null; }
        } else if (diyHasSpeech.current && !diySilenceTimer.current) {
          dlog(`silence db=${db.toFixed(0)}, wait 0.8s`);
          diySilenceTimer.current = setTimeout(() => {
            diySilenceTimer.current = null;
            if (diyRunning.current && diyRecording.current) diyProcessTurn();
          }, 800);
        }
      });
      await rec.startAsync();
      dlog('mic: recording started');

      // Fallback: if metering never fires (device quirk), force a turn after 8s
      setTimeout(() => {
        if (diyRunning.current && diyRecording.current === rec && !diyHasSpeech.current) {
          dlog('fallback: no speech in 8s, restarting mic');
          diyStopRecording();
          diyStartRecording();
        }
      }, 8000);
    } catch (e: any) {
      dlog(`mic ERROR: ${e?.message ?? e}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const diyProcessTurn = useCallback(async () => {
    if (!diyRunning.current) return;
    const rec = diyRecording.current;
    diyRecording.current = null;
    if (diySilenceTimer.current) { clearTimeout(diySilenceTimer.current); diySilenceTimer.current = null; }
    setStatus('thinking');
    dlog('turn: stopping recording...');

    try {
      if (rec) {
        diyStopPromise.current = rec.stopAndUnloadAsync().catch(() => {});
        await diyStopPromise.current;
      }
      const uri = rec?.getURI?.() ?? null;
      dlog(`turn: uri=${uri ? 'ok' : 'NULL'}`);
      if (!uri) { if (diyRunning.current) diyStartRecording(); return; }

      // Transcribe via backend
      dlog('stt: sending...');
      const token = diyAuthToken.current;
      const formData = new FormData();
      // Use audio/mp4 — the valid MIME type for .m4a files
      formData.append('audio', { uri, type: 'audio/mp4', name: 'audio.m4a' } as any);
      const sttResp = await fetch(`${diyBackendUrl}/api/stt/transcribe`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const sttData = await sttResp.json();
      const transcript: string = sttData.transcript ?? '';
      const d = sttData.debug;
      dlog(`stt: "${transcript.slice(0, 40)}" | ${d ? `${d.bytes}B ${d.duration?.toFixed(1)}s ct=${d.content_type}` : 'no debug'}`);
      if (!transcript.trim()) {
        dlog(`stt empty! confidence=${d?.confidence}`);
        if (diyRunning.current) diyStartRecording();
        return;
      }

      // LLM — use text() not body.getReader() (RN Hermes has no Streams API)
      dlog('llm: fetching...');
      diyMessages.current.push({ role: 'user', content: transcript });
      const llmResp = await fetch(`${diyBackendUrl}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ messages: diyMessages.current, model: 'gpt-4o-mini' }),
      });
      const rawText = await llmResp.text();
      let fullText = '';
      for (const line of rawText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (chunk.delta) fullText += chunk.delta;
        } catch {}
      }
      dlog(`llm: "${fullText.slice(0, 40)}"`);
      diyMessages.current.push({ role: 'assistant', content: fullText });

      // TTS via expo-speech
      if (fullText.trim() && diyRunning.current) {
        dlog('tts: speaking...');
        setStatus('balu-speaking');
        await new Promise<void>((resolve) => {
          Speech.speak(fullText.trim(), {
            rate: 0.95, pitch: 1.1,
            onDone: () => { dlog('tts: done'); resolve(); },
            onError: (e) => { dlog(`tts err: ${e}`); resolve(); },
            onStopped: () => { dlog('tts: stopped'); resolve(); },
          });
        });
      }

      if (diyRunning.current) {
        // Reset audio mode after TTS — Speech.speak may have changed audio focus
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
        await new Promise(r => setTimeout(r, 150));
        diyStartRecording();
      }
    } catch (e: any) {
      dlog(`ERROR: ${e?.message ?? e}`);
      if (diyRunning.current) diyStartRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diyBackendUrl, diyStartRecording]);

  const startNativeDiy = useCallback(async () => {
    diyRunning.current = true;
    diyMessages.current = [{ role: 'system', content: diySystemPrompt() }];
    setNativeDiyActive(true);
    setDebugLog([]);
    callStartTimeRef.current = Date.now();
    trackBaluSessionStarted('diy' as any);
    dlog(`start: backend=${diyBackendUrl}`);
    // Pre-fetch auth token once so per-turn requests don't block on token refresh
    const { auth } = await import('../../src/lib/firebase');
    diyAuthToken.current = (await auth.currentUser?.getIdToken()) ?? null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, playThroughEarpieceAndroid: false });
    diyStartRecording();
  }, [diySystemPrompt, diyStartRecording, dlog, diyBackendUrl]);

  const stopNativeDiy = useCallback(() => {
    diyRunning.current = false;
    diyStopRecording();
    Speech.stop();
    if (callStartTimeRef.current > 0) {
      const dur = Math.round((Date.now() - callStartTimeRef.current) / 1000);
      callStartTimeRef.current = 0;
      trackBaluSessionEnded('diy' as any, dur, 'user');
    }
    setNativeDiyActive(false);
    setSecondsLeft(SESSION_SECONDS);
    setStatus('idle');
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
  }, [diyStopRecording]);

  // ── Daily quota countdown (ends call when daily limit hit) ──────────────────
  useEffect(() => {
    const active = ['active', 'balu-speaking', 'user-speaking', 'thinking'];
    if (!active.includes(status)) return;
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(id); endCall('timer'); return SESSION_SECONDS; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, endCall]);

  // ── Pulse ring when user speaks ─────────────────────────────────────────────
  useEffect(() => {
    if (status === 'user-speaking') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [status]);

  // ── WebView messages ────────────────────────────────────────────────────────
  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'call-start':
          setStatus('active');
          break;
        case 'call-end':
          if (msg.payload?.call_id) callIdRef.current = msg.payload.call_id;
          endCall();
          break;
        case 'speech-start':      setStatus('balu-speaking'); break;
        case 'speech-end':        setStatus('thinking'); break;
        case 'user-speech-start': setStatus('user-speaking'); break;
        case 'user-speech-end':   setStatus('thinking'); break;
        case 'error':
          console.warn('[Balu] Vapi error:', msg.payload?.message);
          endCall('error');
          setStatus('error');
          setErrorMsg(msg.payload?.message ?? 'Unknown error');
          break;
      }
    } catch {}
  }, [endCall]);

  const isInCall    = callActive || nativeDiyActive;
  const isSpeaking  = status === 'balu-speaking';
  const isListening = status === 'user-speaking' || status === 'active';

  return (
    <LinearGradient colors={['#fff8f0', '#ffd4a0']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Avatar: frozen absolute position, completely immune to layout changes ── */}
      <View
        pointerEvents="none"
        style={[styles.avatarArea, { top: avatarPos.top, left: avatarPos.left, width: avatarSize, height: avatarSize }]}
      >
        <Animated.View style={[styles.glowRing, { opacity: isInCall ? 0 : glowOpacity, transform: [{ scale: glowScale }] }]} />
        <View style={styles.avatarCircle}>
          <AvatarErrorBoundary fallback={<Text style={{ fontSize: 100 }}>{COMPANION.emoji}</Text>}>
            <RiveNarratorAvatar
              isSpeaking={isSpeaking}
              isListening={isListening}
              size={avatarSize}
            />
          </AvatarErrorBoundary>
        </View>
      </View>

      <SafeAreaView style={styles.safe}>

        {/* ── Top bar: BOTH children always absolute so container height never changes ── */}
        <View style={styles.topBar}>
          <View style={[styles.topIdle, { opacity: isInCall ? 0 : 1 }]} pointerEvents={isInCall ? 'none' : 'auto'}>
            <Text style={styles.title}>{COMPANION.name} {COMPANION.emoji}</Text>
            {isStoryMode && storyTitle
              ? <Text style={styles.subtitle} numberOfLines={1}>📖 {storyTitle}</Text>
              : <Text style={styles.subtitle}>Your friendly story companion</Text>
            }
          </View>
          <View style={[styles.header, { opacity: isInCall ? 1 : 0 }]} pointerEvents={isInCall ? 'auto' : 'none'}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => endCall('user')} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#78350f" />
            </TouchableOpacity>
            <Text style={styles.titleSmall}>{COMPANION.name} {COMPANION.emoji}</Text>
            <View style={styles.timerBadge}>
              <Ionicons name="time-outline" size={14} color="#78350f" />
              <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
            </View>
          </View>
        </View>

        {/* spacer that takes up exactly where the avatar lives */}
        <View style={{ flex: 1 }} />

        {/* ── Bottom bar: fixed height ── */}
        {/* Idle content is conditionally rendered (not just opacity-hidden) so no ghost touches during calls */}
        <View style={styles.bottomBar}>
          <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
          {nativeDiyActive && debugLog.length > 0 && (
            <View style={{ alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.07)', borderRadius: 8, padding: 6, marginBottom: 4 }}>
              {debugLog.map((line, i) => (
                <Text key={i} style={{ fontSize: 10, color: '#78350f', fontFamily: 'monospace' }}>{line}</Text>
              ))}
            </View>
          )}
          {status === 'error' && errorMsg
            ? <Text style={styles.errorDetail}>{errorMsg}</Text>
            : null}
          {!isInCall && (
            <>
              <Text style={styles.remainingText}>
                {dailyRemaining !== null
                  ? (dailyRemaining <= 0
                      ? 'Daily limit reached — come back tomorrow!'
                      : `${Math.floor(dailyRemaining / 60)}m ${dailyRemaining % 60}s left today`)
                  : ' '}
              </Text>
              {/* F02: Stories/Fun toggle hidden — always fun mode */}
              <TouchableOpacity
                style={[styles.startBtn, isStoryMode && storyQuery.isLoading && { opacity: 0.6 }]}
                onPress={startConversation}
                activeOpacity={0.85}
                disabled={isStoryMode && storyQuery.isLoading}
              >
                {isStoryMode && storyQuery.isLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="mic" size={22} color="#fff" /><Text style={styles.startBtnText}>Start Talking</Text></>
                }
              </TouchableOpacity>
              {/* DIY toggle hidden from release — preserved in code for testing */}
            </>
          )}
          {/* Call controls: absolutely positioned within bottomBar so height stays fixed */}
          {isInCall && (
            <View style={styles.callControls}>
              <Animated.View style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]} pointerEvents="none">
                <Ionicons
                  name={status === 'user-speaking' ? 'mic' : 'mic-outline'}
                  size={28}
                  color="#f97316"
                />
              </Animated.View>
              <TouchableOpacity style={styles.endBtn} onPress={() => endCall('user')} activeOpacity={0.8}>
                <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
            </View>
          )}
        </View>

      </SafeAreaView>

      {/* Hidden WebView — only mounted during call */}
      {callActive && micGranted && (
        <WebView
          ref={webViewRef}
          source={callMode === 'diy'
            ? { html: buildDiyBaluHtml(userData?.name ?? '', userData?.age ?? 0, baluMemory), baseUrl: BACKEND_HTTP_URL }
            : { html: buildBaluHtml(
                isStoryMode && VAPI_STORY_ASSISTANT_ID
                  ? VAPI_STORY_ASSISTANT_ID
                  : assistantMode === 'learning' && VAPI_ASSISTANT_ID_V2
                    ? VAPI_ASSISTANT_ID_V2
                    : VAPI_ASSISTANT_ID,
                currentUser?.uid ?? '',
                baluMemory,
                userData?.name ?? '',
                userData?.age ?? 0,
                storyContext,
                isStoryMode && storyTitle ? `Namaste! I'm Balu 🐻 Let's explore the story of ${storyTitle}! Are you ready?` : ''
              ), baseUrl: 'https://vapi.ai' }}
          onMessage={onWebViewMessage}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          javaScriptEnabled={true}
          originWhitelist={['*']}
          onError={(e) => { console.error('[BaluWebView]', e.nativeEvent); setStatus('error'); setErrorMsg(e.nativeEvent.description ?? 'WebView error'); }}
          style={styles.hiddenWebView}
        />
      )}
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(_c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    safe: { flex: 1, paddingHorizontal: 20 },

    // Top bar — FIXED height, both children are absolute so height never shifts
    topBar: {
      height: 72,
      position: 'relative',
    },
    topIdle: {
      position: 'absolute',
      left: 0, right: 0, top: 0, bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      position: 'absolute',
      left: 0, right: 0, top: 0, bottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    closeBtn: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(249,115,22,0.12)',
    },
    timerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(249,115,22,0.12)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    timerText:  { color: '#78350f', fontSize: 14, fontWeight: '700' },
    title:      { textAlign: 'center', fontSize: 28, fontWeight: '800', color: '#1c0a00' },
    titleSmall: { fontSize: 20, fontWeight: '800', color: '#1c0a00' },
    subtitle:   { textAlign: 'center', fontSize: 14, color: '#a16207', marginTop: 2 },

    // Avatar — frozen absolute position (top/left/width/height set inline from avatarPos)
    avatarArea: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarCircle: {
      width: SCREEN_WIDTH * 0.72,
      height: SCREEN_WIDTH * 0.72,
      borderRadius: SCREEN_WIDTH * 0.36,
      overflow: 'hidden',
    },
    glowRing: {
      position: 'absolute',
      width: SCREEN_WIDTH * 0.85,
      height: SCREEN_WIDTH * 0.85,
      borderRadius: SCREEN_WIDTH * 0.425,
      backgroundColor: '#f97316',
    },

    // Bottom bar — FIXED height, all idle content always in flow (opacity toggled)
    // Call controls are absolute within bottomBar so they don't affect height
    bottomBar: {
      height: 230,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 4,
    },
    statusText: {
      textAlign: 'center',
      color: '#78350f',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 6,
    },
    errorDetail: {
      textAlign: 'center',
      color: '#ef4444',
      fontSize: 12,
      marginBottom: 4,
    },
    remainingText: {
      textAlign: 'center',
      color: '#a16207',
      fontSize: 12,
      marginBottom: 8,
    },
    modeToggle: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
      alignSelf: 'stretch',
    },
    modeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 16,
      backgroundColor: 'rgba(249,115,22,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(249,115,22,0.2)',
    },
    modeBtnActive:     { backgroundColor: '#f97316', borderColor: '#f97316' },
    modeBtnText:       { color: '#c2410c', fontSize: 13, fontWeight: '700' },
    modeBtnDesc:       { color: '#c2410c', fontSize: 10, marginTop: 1, opacity: 0.7 },
    modeBtnTextActive: { color: '#fff', opacity: 1 },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: '#f97316',
      borderRadius: 32,
      paddingVertical: 16,
      paddingHorizontal: 40,
    },
    startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },

    // Call controls — absolute within bottomBar, no ghost touches since idle content is unmounted
    callControls: {
      position: 'absolute',
      bottom: 12,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    },
    micRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(249,115,22,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#f97316',
    },
    endBtn: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#ef4444',
      alignItems: 'center',
      justifyContent: 'center',
    },

    hiddenWebView: {
      height: 1,
      width: 1,
      opacity: 0,
      position: 'absolute',
      bottom: 0,
    },

    callModeToggle: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    callModeBtn: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: 'rgba(249,115,22,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(249,115,22,0.2)',
    },
    callModeBtnActive:     { backgroundColor: 'rgba(249,115,22,0.18)', borderColor: '#f97316' },
    callModeBtnText:       { color: '#c2410c', fontSize: 12, fontWeight: '600' },
    callModeBtnTextActive: { color: '#f97316' },
  });
}
