import { useState, useMemo, useEffect, useRef, useCallback, Component } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBlockContent, useUpdateProgress } from '../../../src/hooks/useStaticStories';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useNarrator } from '../../../src/hooks/useNarrator';
import {
  trackNarratorPause,
  trackNarratorLanguageSwitched,
  trackNarratorBlockNavigated,
  trackNarratorCompleted,
} from '../../../src/utils/analytics';
import RiveNarratorAvatar from '../../../src/components/RiveNarratorAvatar';
import { useOnboarding } from '../../../src/contexts/OnboardingContext';
import type { ContentBlock } from '../../../src/types/stories';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Avatar error boundary (SVG crashes on some Android OEMs) ──────────────────
class AvatarErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(e: Error) { console.error('[NarratorAvatar] SVG crash:', e.message); }
  render() { return this.state.crashed ? this.props.fallback : this.props.children; }
}

// ── Safe haptics (devices without vibrator throw on impactAsync) ───────────────
function triggerHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type Language = 'en' | 'hi';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SKIP_TYPES = new Set(['divider', 'audio', 'image']);
const THINKING_TYPES = new Set(['reflection', 'discussion']);
const COUNTDOWN_SECONDS = 8;

const BLOCK_LABELS: Record<string, string> = {
  hook:            'Opening',
  story_body:      'The Story',
  reflection:      'Reflect',
  blessing:        'Blessing',
  discussion:      "Let's Talk",
  quiz:            'Quick Check',
  value_highlight: 'Values',
  character_intro: 'Character',
};

const BLOCK_ACCENT: Record<string, string> = {
  hook:            '#f97316',
  text:            '#a855f7',
  story_body:      '#a855f7',
  reflection:      '#06b6d4',
  discussion:      '#3b82f6',
  quiz:            '#ef4444',
  value_highlight: '#22c55e',
  blessing:        '#ec4899',
};

function getBlockAccent(type: string) {
  return BLOCK_ACCENT[type] ?? '#f97316';
}

const PAUSED_MESSAGES = [
  'Tap me to continue! 👆',
  "I'm waiting for you ✨",
  "Take your time — I'll be right here 🌟",
  'Want to hear what happens next? 👀',
  'Shall we continue our adventure? 🚀',
  'Ready when you are! 💫',
  'The story is waiting for us! 📖',
];

function getBlockText(block: ContentBlock, language: Language): string {
  const b = block as any;
  switch (block.type) {
    case 'hook':
    case 'text':
    case 'story_body':
    case 'blessing':
      return b.content?.[language] ?? '';
    case 'reflection':
    case 'discussion':
      return b.question?.[language] ?? '';
    case 'quiz':
      return b.question?.[language] ?? '';
    case 'value_highlight':
      return b.explanation?.[language] ?? '';
    case 'character_intro':
      return b.name?.[language] ?? '';
    default:
      return '';
  }
}

function getAudioUrl(block: ContentBlock, language: Language): string | undefined {
  const b = block as any;
  return language === 'en' ? b.audio_url_en : b.audio_url_hi;
}

// ── Category gradient backgrounds ────────────────────────────────────────────

const CATEGORY_GRADIENTS: Record<string, readonly [string, string, string]> = {
  mahabharata:  ['#1a0a3d', '#4a1570', '#0a0a0a'],
  ramayana:     ['#3d1a00', '#8b3a0a', '#0a0a0a'],
  habits:       ['#002a3d', '#0a5070', '#0a0a0a'],
  emotions:     ['#3d001a', '#8b1050', '#0a0a0a'],
  moral_values: ['#003d1a', '#0a7040', '#0a0a0a'],
};

function getCategoryGradient(category: string): readonly [string, string, string] {
  return CATEGORY_GRADIENTS[category] ?? ['#1a1a2e', '#2d2d4e', '#0a0a0a'];
}

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  const MAX_DOTS = 10;
  const count = Math.min(total, MAX_DOTS);
  const step = total > 1 ? Math.floor((current / (total - 1)) * (count - 1)) : 0;
  const widthAnims = useRef(
    Array.from({ length: MAX_DOTS }, () => new Animated.Value(6))
  ).current;

  useEffect(() => {
    widthAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === step ? 18 : 6,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
  }, [step]);

  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            i === step && styles.dotActive,
            { width: widthAnims[i] },
          ]}
        />
      ))}
    </View>
  );
}

// ── Countdown circle ──────────────────────────────────────────────────────────

function CountdownBadge({ seconds }: { seconds: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);

  const color = seconds <= 3 ? '#ef4444' : '#06b6d4';

  return (
    <Animated.View style={[styles.countdownBadge, { opacity: fadeAnim, borderColor: color }]}>
      <Text style={[styles.countdownText, { color }]}>{seconds}</Text>
    </Animated.View>
  );
}

// ── Speech bubble ─────────────────────────────────────────────────────────────

function SpeechBubble({
  label,
  text,
  isLoading,
  accentColor,
  fadeAnim,
  countdown,
  scrollRef,
}: {
  label: string;
  text: string;
  isLoading: boolean;
  accentColor: string;
  fadeAnim: Animated.Value;
  countdown: number | null;
  scrollRef: React.RefObject<ScrollView | null>;
}) {
  return (
    <View style={styles.bubbleWrapper}>
      <View style={styles.bubbleTail} />
      <View style={[styles.bubble, { borderLeftColor: accentColor }]}>
        {label ? <Text style={[styles.bubbleLabel, { color: accentColor }]}>{label.toUpperCase()}</Text> : null}
        {isLoading ? (
          <ActivityIndicator size="small" color="#f97316" style={{ marginTop: 8 }} />
        ) : (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            bounces={false}
            style={styles.bubbleScroll}
          >
            <Animated.Text style={[styles.bubbleText, { opacity: fadeAnim }]}>{text}</Animated.Text>
          </ScrollView>
        )}
        {countdown !== null && (
          <View style={styles.countdownContainer}>
            <CountdownBadge seconds={countdown} />
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NarratorScreen() {
  const { top: safeTop } = useSafeAreaInsets();
  const { contentId, from } = useLocalSearchParams<{ contentId?: string; from?: string }>();
  const storyId = contentId || 'maha-001';

  const [language, setLanguage] = useState<Language>('en');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pausedMsgIndex, setPausedMsgIndex] = useState(0);

  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedMsgRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIndexRef = useRef(0);
  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const textScrollRef = useRef<ScrollView>(null);

  const { currentUser } = useAuth();
  const { triggerFeedback, onLanguageToggled } = useOnboarding();
  const { data: content, isLoading: contentLoading } = useBlockContent({ storyId });
  const updateProgress = useUpdateProgress();

  const blocks = useMemo(() => {
    if (!content?.blocks) return [];
    return content.blocks.filter((b) => !SKIP_TYPES.has(b.type));
  }, [content?.blocks]);

  const currentBlock = blocks[currentIndex] ?? null;
  const audioUrl = currentBlock ? getAudioUrl(currentBlock, language) : undefined;
  const narrator = useNarrator(audioUrl);

  const blockText  = currentBlock ? getBlockText(currentBlock, language) : '';
  const blockLabel = currentBlock ? (BLOCK_LABELS[currentBlock.type] ?? '') : '';
  const accentColor = currentBlock ? getBlockAccent(currentBlock.type) : '#f97316';
  const isPaused = narrator.hasAudio && !narrator.isPlaying && !narrator.isLoading && !narrator.isFinished;
  const gradient   = getCategoryGradient(content?.category ?? '');
  const isFirst    = currentIndex === 0;
  const isLast     = currentIndex === blocks.length - 1;

  // Stop audio and timers when navigating away (tab switch, back, etc.)
  useFocusEffect(
    useCallback(() => {
      return () => {
        narrator.stop();
        if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (pausedMsgRef.current) { clearInterval(pausedMsgRef.current); pausedMsgRef.current = null; }
      };
    }, [narrator.stop])
  );

  // Cycle paused encouragement messages while audio is paused
  useEffect(() => {
    if (isPaused) {
      pausedMsgRef.current = setInterval(() => {
        setPausedMsgIndex((i) => (i + 1) % PAUSED_MESSAGES.length);
      }, 4000);
    } else {
      if (pausedMsgRef.current) { clearInterval(pausedMsgRef.current); pausedMsgRef.current = null; }
      setPausedMsgIndex(0);
    }
    return () => { if (pausedMsgRef.current) { clearInterval(pausedMsgRef.current); pausedMsgRef.current = null; } };
  }, [isPaused]);

  // Clear any pending timers
  const clearTimers = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  // Keep ref in sync for use inside callbacks
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // Mark story as in_progress when content loads (covers the Play tab flow where block-viewer is skipped)
  useEffect(() => {
    if (currentUser?.uid && content?.category) {
      updateProgress.mutate({ userId: currentUser.uid, storyId, currentSegment: 0, status: 'in_progress' });
    }
  }, [storyId, !!content, currentUser?.uid]);

  // Track narrator_completed when last block finishes playing
  useEffect(() => {
    if (isLast && narrator.isFinished && blocks.length > 0) {
      trackNarratorCompleted(storyId, content?.category ?? '', blocks.length, blocks.length);
      triggerFeedback();
    }
  }, [isLast, narrator.isFinished]);

  // Text fade-in + scroll to top when block or language changes
  useEffect(() => {
    textFadeAnim.setValue(0);
    textScrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(textFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [currentIndex, language]);

  // Auto-advance logic
  useEffect(() => {
    if (!narrator.isFinished || !autoAdvance || isLast) return;

    const isThinkingBlock = THINKING_TYPES.has(currentBlock?.type ?? '');

    if (isThinkingBlock) {
      // Start countdown
      let remaining = COUNTDOWN_SECONDS;
      setCountdown(remaining);
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearTimers();
          goNext('auto');
        }
      }, 1000);
    } else {
      // Short breath pause then advance
      autoAdvanceTimerRef.current = setTimeout(() => {
        goNext('auto');
      }, 800);
    }

    return () => clearTimers();
  }, [narrator.isFinished]);

  const goNext = useCallback((method: 'button' | 'swipe' | 'auto' = 'button') => {
    const from = currentIndexRef.current;
    const to = Math.min(from + 1, blocks.length - 1);
    trackNarratorBlockNavigated(storyId, from, to, currentBlock?.type ?? '', method);
    clearTimers();
    narrator.stop();
    setCurrentIndex(to);
  }, [blocks.length, clearTimers, storyId, currentBlock?.type]);

  const goPrev = useCallback(() => {
    const from = currentIndexRef.current;
    const to = Math.max(from - 1, 0);
    trackNarratorBlockNavigated(storyId, from, to, currentBlock?.type ?? '', 'button');
    clearTimers();
    narrator.stop();
    setCurrentIndex(to);
  }, [clearTimers, storyId, currentBlock?.type]);

  const toggleLanguage = useCallback(() => {
    clearTimers();
    narrator.stop();
    onLanguageToggled();
    setLanguage((l) => {
      const next = l === 'en' ? 'hi' : 'en';
      trackNarratorLanguageSwitched(storyId, currentIndexRef.current, l, next);
      return next;
    });
  }, [clearTimers, storyId, onLanguageToggled]);

  // Swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) {
          triggerHaptic();
          goNext('swipe');
        } else if (g.dx > 50) {
          triggerHaptic();
          goPrev();
        }
      },
    })
  ).current;

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimers();
    if (pausedMsgRef.current) clearInterval(pausedMsgRef.current);
  }, []);

  const goBack = useCallback(() => {
    clearTimers();
    narrator.stop();
    if (from === 'play') router.replace('/(app)/play');
    else router.back();
  }, [from, clearTimers, narrator.stop]);

  return (
    <LinearGradient colors={gradient as any} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Always-visible back button overlay */}
      <TouchableOpacity
        onPress={goBack}
        style={[styles.backBtn, { top: safeTop + 8 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Language toggle — top right */}
      <TouchableOpacity
        onPress={toggleLanguage}
        style={[styles.langBtnOverlay, { top: safeTop + 8 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.langBtnOverlayText}>
          {language === 'en' ? '🌐 हिं' : '🌐 EN'}
        </Text>
      </TouchableOpacity>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {contentLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#f97316" />
            <Text style={styles.loadingText}>Preparing narrator…</Text>
          </View>
        ) : (
          <View style={styles.content} {...panResponder.panHandlers}>
            {/* Progress */}
            {blocks.length > 0 && (
              <ProgressDots total={blocks.length} current={currentIndex} />
            )}

            {/* Avatar — tap anywhere to pause/play */}
            <TouchableOpacity
              style={styles.avatarArea}
              onPress={() => {
                if (narrator.hasAudio) {
                  triggerHaptic();
                  if (narrator.isPlaying) {
                    trackNarratorPause(storyId, currentIndexRef.current, currentBlock?.type ?? '');
                  }
                  narrator.toggle();
                }
              }}
              activeOpacity={1}
            >
              <AvatarErrorBoundary
                fallback={<Text style={styles.avatarFallback}>🦁</Text>}
              >
                <RiveNarratorAvatar
                  isSpeaking={narrator.isPlaying}
                  isLoading={narrator.isLoading}
                  blockType={currentBlock?.type}
                  size={SCREEN_WIDTH}
                />
              </AvatarErrorBoundary>
              {isPaused && (
                <View style={styles.pausedOverlay}>
                  <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.9)" />
                </View>
              )}
            </TouchableOpacity>

            {/* Speech bubble */}
            <SpeechBubble
              label={isPaused ? 'Paused' : blockLabel}
              text={isPaused ? PAUSED_MESSAGES[pausedMsgIndex] : blockText}
              isLoading={narrator.isLoading && !blockText}
              accentColor={isPaused ? 'rgba(255,255,255,0.45)' : accentColor}
              fadeAnim={textFadeAnim}
              countdown={countdown}
              scrollRef={textScrollRef}
            />

            {/* Navigation */}
            <View style={styles.navRow}>
              <TouchableOpacity
                style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
                onPress={goPrev}
                disabled={isFirst}
              >
                <Ionicons name="chevron-back" size={20} color={isFirst ? 'rgba(255,255,255,0.3)' : '#fff'} />
                <Text style={[styles.navText, isFirst && { opacity: 0.3 }]}>Prev</Text>
              </TouchableOpacity>

              {/* Speed toggle */}
              <TouchableOpacity onPress={() => narrator.cycleSpeed()} style={styles.speedBtn}>
                <Text style={styles.speedBtnText}>{narrator.speed}x</Text>
              </TouchableOpacity>

              {/* Auto-advance toggle */}
              <TouchableOpacity
                style={styles.autoBtn}
                onPress={() => {
                  setAutoAdvance((v) => !v);
                  clearTimers();
                }}
              >
                <Ionicons
                  name={autoAdvance ? 'play-skip-forward' : 'play-skip-forward-outline'}
                  size={18}
                  color={autoAdvance ? '#f97316' : 'rgba(255,255,255,0.4)'}
                />
                <Text style={[styles.autoBtnText, { color: autoAdvance ? '#f97316' : 'rgba(255,255,255,0.4)' }]}>
                  Auto
                </Text>
              </TouchableOpacity>

              {isLast ? (
                <TouchableOpacity
                  style={styles.finishBtn}
                  onPress={goBack}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.finishText}>Finish</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.navBtn} onPress={() => goNext('button')}>
                  <Text style={styles.navText}>Next</Text>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {/* Slide count */}
            {blocks.length > 0 && (
              <Text style={styles.countText}>
                {currentIndex + 1} / {blocks.length}
              </Text>
            )}
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    position: 'absolute', left: 12, zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 6,
  },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    marginTop: 14, color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500',
  },

  // Progress dots
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 5, marginTop: 8, marginBottom: 12,
  },
  dot: {
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: { backgroundColor: '#f97316' },

  // Avatar area — fixed height so it's always fully visible regardless of text length
  avatarArea: {
    height: SCREEN_HEIGHT * 0.48,
    width: SCREEN_WIDTH,
    marginHorizontal: -20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarFallback: {
    fontSize: SCREEN_WIDTH * 0.35,
    textAlign: 'center',
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Speech bubble — flex: 1 so it fills remaining space; text scrolls inside
  bubbleWrapper: { flex: 1, marginBottom: 8 },
  bubbleTail: {
    alignSelf: 'center',
    width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  bubble: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderLeftWidth: 3,
    padding: 20,
  },
  bubbleScroll: { flex: 1 },
  bubbleLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8,
  },
  bubbleText: {
    fontSize: 17, color: '#fff', lineHeight: 26, fontWeight: '400',
  },

  // Countdown
  countdownContainer: {
    position: 'absolute', bottom: 14, right: 14,
  },
  countdownBadge: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  countdownText: {
    fontSize: 14, fontWeight: '700',
  },

  // Language toggle — top-right overlay
  langBtnOverlay: {
    position: 'absolute', right: 12, zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  langBtnOverlayText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  speedBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(249,115,22,0.25)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.5)',
  },
  speedBtnText: { color: '#f97316', fontSize: 13, fontWeight: '700' },

  // Navigation
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 16, marginBottom: 4,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, minWidth: 100, justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.4 },
  navText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  autoBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 2, padding: 8,
  },
  autoBtnText: { fontSize: 10, fontWeight: '600' },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#22c55e',
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 24, minWidth: 100, justifyContent: 'center',
  },
  finishText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  countText: {
    textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 4,
  },
});
