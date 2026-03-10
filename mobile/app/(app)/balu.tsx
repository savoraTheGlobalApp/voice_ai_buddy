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
import { SafeAreaView } from 'react-native-safe-area-context';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const VAPI_PUBLIC_KEY   = process.env.EXPO_PUBLIC_VAPI_KEY ?? '';
const VAPI_ASSISTANT_ID = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID ?? '';
const SESSION_SECONDS   = 3 * 60;

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

const BALU_HTML = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:transparent}</style></head>
<body>
<script>
  window.__VAPI_KEY__ = ${JSON.stringify(VAPI_PUBLIC_KEY)};
  window.__VAPI_ASSISTANT_ID__ = ${JSON.stringify(VAPI_ASSISTANT_ID)};
  function post(type, payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} })); } catch(e) {}
  }
  function initVapi() {
    try {
      var vapi = new window.Vapi(window.__VAPI_KEY__);
      vapi.on('call-start',   function() { post('call-start'); });
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
</html>`;

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function BaluScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser } = useAuth();

  const [status, setStatus]                   = useState<CallStatus>('idle');
  const [micGranted, setMicGranted]           = useState(false);
  const [callActive, setCallActive]           = useState(false);
  const [secondsLeft, setSecondsLeft]         = useState(SESSION_SECONDS);
  const [errorMsg, setErrorMsg]               = useState('');
  const [dailyRemaining, setDailyRemaining]   = useState<number | null>(null);
  const callStartTimeRef                       = useRef<number>(0);
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
      body: JSON.stringify({ seconds_used: used }),
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
  const endCall = useCallback(() => {
    if (callStartTimeRef.current > 0) {
      recordUsage(callStartTimeRef.current);
      callStartTimeRef.current = 0;
    }
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'stop' }) })); true;`
    );
    setCallActive(false);
    setSecondsLeft(SESSION_SECONDS);
    setStatus('idle');
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
  }, [recordUsage]);

  // ── Session timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const active = ['active', 'balu-speaking', 'user-speaking', 'thinking'];
    if (!active.includes(status)) return;
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(id); endCall(); return SESSION_SECONDS; }
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
        case 'call-start':        setStatus('active'); break;
        case 'call-end':          endCall(); break;
        case 'speech-start':      setStatus('balu-speaking'); break;
        case 'speech-end':        setStatus('thinking'); break;
        case 'user-speech-start': setStatus('user-speaking'); break;
        case 'user-speech-end':   setStatus('thinking'); break;
        case 'error':
          console.warn('[Balu] Vapi error:', msg.payload?.message);
          setStatus('error');
          setErrorMsg(msg.payload?.message ?? 'Unknown error');
          break;
      }
    } catch {}
  }, [endCall]);

  const isIdle   = status === 'idle';
  const isInCall = callActive;
  const isSpeaking = status === 'balu-speaking';
  const isLoading  = status === 'connecting' || status === 'thinking';

  return (
    <LinearGradient colors={['#fff8f0', '#ffd4a0']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>

        {/* ── Top bar: same structure always, opacity toggles content ── */}
        <View style={styles.topBar}>
          {/* Idle: title + subtitle */}
          <View style={{ opacity: isInCall ? 0 : 1, position: isInCall ? 'absolute' : 'relative' }}>
            <Text style={styles.title}>{COMPANION.name} {COMPANION.emoji}</Text>
            <Text style={styles.subtitle}>Your friendly story companion</Text>
          </View>
          {/* In-call: close + title + timer */}
          <View style={[styles.header, { opacity: isInCall ? 1 : 0, position: isInCall ? 'relative' : 'absolute', left: 0, right: 0 }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={endCall} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#78350f" />
            </TouchableOpacity>
            <Text style={styles.titleSmall}>{COMPANION.name} {COMPANION.emoji}</Text>
            <View style={styles.timerBadge}>
              <Ionicons name="time-outline" size={14} color="#78350f" />
              <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
            </View>
          </View>
        </View>

        {/* ── Avatar: flex:1 center, same in both states ── */}
        <View style={styles.avatarArea}>
          <Animated.View style={[styles.glowRing, { opacity: isInCall ? 0 : glowOpacity, transform: [{ scale: glowScale }] }]} />
          <View style={styles.avatarCircle}>
            <AvatarErrorBoundary fallback={<Text style={{ fontSize: 100 }}>{COMPANION.emoji}</Text>}>
              <RiveNarratorAvatar
                isSpeaking={isSpeaking}
                isLoading={isLoading}
                size={SCREEN_WIDTH * 0.72}
              />
            </AvatarErrorBoundary>
          </View>
        </View>

        {/* ── Bottom bar: same structure always, opacity toggles content ── */}
        <View style={styles.bottomBar}>
          <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
          {status === 'error' && errorMsg
            ? <Text style={styles.errorDetail}>{errorMsg}</Text>
            : null}
          {/* Daily remaining */}
          {!isInCall && dailyRemaining !== null && (
            <Text style={styles.remainingText}>
              {dailyRemaining <= 0
                ? 'Daily limit reached — come back tomorrow!'
                : `${Math.floor(dailyRemaining / 60)}m ${dailyRemaining % 60}s left today`}
            </Text>
          )}
          {/* Idle controls */}
          <TouchableOpacity
            style={[styles.startBtn, { opacity: isInCall ? 0 : 1 }]}
            onPress={isInCall ? undefined : startConversation}
            activeOpacity={0.85}
          >
            <Ionicons name="mic" size={22} color="#fff" />
            <Text style={styles.startBtnText}>Start Talking</Text>
          </TouchableOpacity>
          {/* Call controls — always rendered, invisible when idle */}
          <View pointerEvents={isInCall ? 'auto' : 'none'} style={[styles.callControls, { opacity: isInCall ? 1 : 0, position: 'absolute', bottom: 0, left: 0, right: 0, justifyContent: 'center' }]}>
            <Animated.View style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons
                name={status === 'user-speaking' ? 'mic' : 'mic-outline'}
                size={28}
                color="#f97316"
              />
            </Animated.View>
            <TouchableOpacity style={styles.endBtn} onPress={endCall} activeOpacity={0.8}>
              <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>

      {/* Hidden WebView — only mounted during call */}
      {callActive && micGranted && (
        <WebView
          ref={webViewRef}
          source={{ html: BALU_HTML, baseUrl: 'https://vapi.ai' }}
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

    // Fixed top section — title/header always same height
    topBar: {
      height: 80,
      justifyContent: 'center',
    },
    header: {
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
    timerText: { color: '#78350f', fontSize: 14, fontWeight: '700' },
    title: {
      textAlign: 'center',
      fontSize: 28,
      fontWeight: '800',
      color: '#1c0a00',
    },
    titleSmall: {
      fontSize: 20,
      fontWeight: '800',
      color: '#1c0a00',
    },
    subtitle: {
      textAlign: 'center',
      fontSize: 14,
      color: '#a16207',
      marginTop: 2,
    },

    // Avatar always centered, takes remaining space
    avatarArea: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
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

    // Fixed bottom section — same height always
    bottomBar: {
      height: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusText: {
      textAlign: 'center',
      color: '#78350f',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 16,
      minHeight: 24,
    },
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
    callControls: {
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
    remainingText: {
      textAlign: 'center',
      color: '#a16207',
      fontSize: 12,
      marginBottom: 8,
    },
    errorDetail: {
      textAlign: 'center',
      color: '#ef4444',
      fontSize: 12,
      marginHorizontal: 20,
      marginBottom: 8,
    },
  });
}
