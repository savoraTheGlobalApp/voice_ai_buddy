import { useState, useMemo, useEffect, useRef, useCallback, Component } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import WebView from 'react-native-webview';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
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

const VAPI_PUBLIC_KEY        = process.env.EXPO_PUBLIC_VAPI_KEY ?? '';
const VAPI_ASSISTANT_ID      = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID ?? '';
const VAPI_ASSISTANT_ID_V2   = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID_V2 ?? '';
const SESSION_SECONDS        = 3 * 60;

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

function buildBaluHtml(assistantId: string) { return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:transparent}</style></head>
<body>
<script>
  window.__VAPI_KEY__ = ${JSON.stringify(VAPI_PUBLIC_KEY)};
  window.__VAPI_ASSISTANT_ID__ = ${JSON.stringify(assistantId)};
  function post(type, payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} })); } catch(e) {}
  }
  function initVapi() {
    try {
      var vapi = new window.Vapi(window.__VAPI_KEY__);
      vapi.on('call-start',   function() {
        // vapi.call is populated by the time call-start fires
        var cid = (vapi.call && vapi.call.id) ? vapi.call.id : '';
        post('call-start', { call_id: cid });
      });
      vapi.on('call-end',     function() { post('call-end'); });
      vapi.on('speech-start', function() { post('speech-start'); });
      vapi.on('speech-end',   function() { post('speech-end'); });
      vapi.on('error', function(e) { post('error', { message: e ? (e.message || e.errorMsg || JSON.stringify(e)) : 'unknown' }); });
      vapi.on('message', function(msg) {
        if (!msg) return;
        if (msg.type === 'transcript' && msg.transcriptType === 'partial') post('user-speech-start');
        if (msg.type === 'transcript' && msg.transcriptType === 'final')   post('user-speech-end', { transcript: msg.transcript });
      });
      vapi.start(window.__VAPI_ASSISTANT_ID__);
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

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function BaluScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser } = useAuth();
  const insets = useSafeAreaInsets();

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
  const [callActive, setCallActive]           = useState(false);
  const [secondsLeft, setSecondsLeft]         = useState(SESSION_SECONDS);
  const [errorMsg, setErrorMsg]               = useState('');
  const [dailyRemaining, setDailyRemaining]   = useState<number | null>(null);
  const [assistantMode, setAssistantMode]     = useState<AssistantMode>('classic');
  const callStartTimeRef                       = useRef<number>(0);
  const callIdRef                              = useRef<string>('');
  const webViewRef = useRef<WebView>(null);
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

  // ── Fetch daily remaining on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    apiClient<{ seconds_remaining: number }>('/api/vapi/remaining')
      .then(r => setDailyRemaining(r.seconds_remaining))
      .catch(() => setDailyRemaining(SESSION_SECONDS)); // fail open
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
    const sessionCap = dailyRemaining !== null
      ? Math.min(SESSION_SECONDS, dailyRemaining)
      : SESSION_SECONDS;
    setSecondsLeft(sessionCap);

    if (micGranted) {
      callStartTimeRef.current = Date.now();
      setCallActive(true);
      setStatus('connecting');
      trackBaluSessionStarted(assistantMode);
      return;
    }
    setStatus('requesting-permission');
    const { granted } = await Audio.requestPermissionsAsync();
    if (granted) {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setMicGranted(true);
      callStartTimeRef.current = Date.now();
      setCallActive(true);
      setStatus('connecting');
      trackBaluSessionStarted(assistantMode);
    } else {
      setStatus('permission-denied');
      Alert.alert(
        'Microphone Access Needed',
        `To talk with ${COMPANION.name}, please allow microphone access in your device settings.`,
        [{ text: 'OK', onPress: () => setStatus('idle') }]
      );
    }
  }, [micGranted, dailyRemaining]);

  // ── End conversation → return to idle ──────────────────────────────────────
  const endCall = useCallback((reason: 'user' | 'timer' | 'error' = 'user') => {
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
  }, [recordUsage, assistantMode]);

  // ── Session timer ───────────────────────────────────────────────────────────
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
          callIdRef.current = msg.payload?.call_id ?? '';
          setStatus('active');
          break;
        case 'call-end':          endCall(); break;
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

  const isInCall    = callActive;
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
            <Text style={styles.subtitle}>Your friendly story companion</Text>
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
              {VAPI_ASSISTANT_ID_V2 ? (
                <View style={styles.modeToggle}>
                  {ASSISTANT_MODES.map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.modeBtn, assistantMode === m.key && styles.modeBtnActive]}
                      onPress={() => { trackBaluModeSwitched(assistantMode, m.key); setAssistantMode(m.key); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.modeBtnText, assistantMode === m.key && styles.modeBtnTextActive]}>{m.label}</Text>
                      <Text style={[styles.modeBtnDesc, assistantMode === m.key && styles.modeBtnTextActive]}>{m.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.startBtn}
                onPress={startConversation}
                activeOpacity={0.85}
              >
                <Ionicons name="mic" size={22} color="#fff" />
                <Text style={styles.startBtnText}>Start Talking</Text>
              </TouchableOpacity>
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
          source={{ html: buildBaluHtml(assistantMode === 'learning' && VAPI_ASSISTANT_ID_V2 ? VAPI_ASSISTANT_ID_V2 : VAPI_ASSISTANT_ID), baseUrl: 'https://vapi.ai' }}
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
      height: 190,
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
  });
}
