import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBlockContent } from '../../../src/hooks/useStaticStories';
import { useNarrator } from '../../../src/hooks/useNarrator';
import NarratorAvatar from '../../../src/components/NarratorAvatar';
import type { ContentBlock } from '../../../src/types/stories';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
}: {
  label: string;
  text: string;
  isLoading: boolean;
  accentColor: string;
  fadeAnim: Animated.Value;
  countdown: number | null;
}) {
  return (
    <View style={styles.bubbleWrapper}>
      <View style={styles.bubbleTail} />
      <View style={[styles.bubble, { borderLeftColor: accentColor }]}>
        {label ? <Text style={[styles.bubbleLabel, { color: accentColor }]}>{label.toUpperCase()}</Text> : null}
        {isLoading ? (
          <ActivityIndicator size="small" color="#f97316" style={{ marginTop: 8 }} />
        ) : (
          <Animated.Text style={[styles.bubbleText, { opacity: fadeAnim }]}>{text}</Animated.Text>
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
  const { contentId } = useLocalSearchParams<{ contentId?: string }>();
  const storyId = contentId || 'maha-001';

  const [language, setLanguage] = useState<Language>('en');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textFadeAnim = useRef(new Animated.Value(1)).current;

  const { data: content, isLoading: contentLoading } = useBlockContent({ storyId });

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
  const gradient   = getCategoryGradient(content?.category ?? '');
  const isFirst    = currentIndex === 0;
  const isLast     = currentIndex === blocks.length - 1;

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

  // Text fade-in when block changes
  useEffect(() => {
    textFadeAnim.setValue(0);
    Animated.timing(textFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [currentIndex]);

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
          setCurrentIndex((i) => Math.min(i + 1, blocks.length - 1));
          narrator.stop();
        }
      }, 1000);
    } else {
      // Short breath pause then advance
      autoAdvanceTimerRef.current = setTimeout(() => {
        setCurrentIndex((i) => Math.min(i + 1, blocks.length - 1));
        narrator.stop();
      }, 800);
    }

    return () => clearTimers();
  }, [narrator.isFinished]);

  const goNext = useCallback(() => {
    clearTimers();
    narrator.stop();
    setCurrentIndex((i) => Math.min(i + 1, blocks.length - 1));
  }, [blocks.length, clearTimers]);

  const goPrev = useCallback(() => {
    clearTimers();
    narrator.stop();
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, [clearTimers]);

  const toggleLanguage = useCallback(() => {
    clearTimers();
    narrator.stop();
    setLanguage((l) => (l === 'en' ? 'hi' : 'en'));
  }, [clearTimers]);

  // Swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          goNext();
        } else if (g.dx > 50) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          goPrev();
        }
      },
    })
  ).current;

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  return (
    <LinearGradient colors={gradient as any} style={styles.root}>
      <Stack.Screen
        options={{
          title: '',
          headerTransparent: true,
          headerTintColor: '#fff',
          headerRight: () => (
            <TouchableOpacity onPress={toggleLanguage} style={styles.langBtn}>
              <Text style={styles.langBtnText}>
                {language === 'en' ? '🌐 हिं' : '🌐 EN'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
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

            {/* Avatar */}
            <View style={styles.avatarArea}>
              <NarratorAvatar
                isSpeaking={narrator.isPlaying}
                isLoading={narrator.isLoading}
                size={SCREEN_WIDTH * 0.42}
              />
              {narrator.hasAudio && (
                <TouchableOpacity
                  style={styles.playPauseBtn}
                  onPress={narrator.toggle}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={narrator.isPlaying ? 'pause-circle' : 'play-circle'}
                    size={36}
                    color="rgba(255,255,255,0.85)"
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Speech bubble */}
            <SpeechBubble
              label={blockLabel}
              text={blockText}
              isLoading={narrator.isLoading && !blockText}
              accentColor={accentColor}
              fadeAnim={textFadeAnim}
              countdown={countdown}
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

              {/* Auto-advance toggle */}
              <TouchableOpacity
                style={styles.autoBtn}
                onPress={() => { setAutoAdvance((v) => !v); clearTimers(); }}
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
                  onPress={() => { clearTimers(); narrator.stop(); router.back(); }}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.finishText}>Finish</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.navBtn} onPress={goNext}>
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
  safe: { flex: 1, paddingHorizontal: 20 },
  content: { flex: 1 },
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

  // Avatar area
  avatarArea: {
    alignItems: 'center', justifyContent: 'center',
    flex: 1, maxHeight: '42%',
  },
  playPauseBtn: {
    position: 'absolute', bottom: -4, right: SCREEN_WIDTH * 0.1,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 24, padding: 2,
  },

  // Speech bubble
  bubbleWrapper: { alignItems: 'center', marginBottom: 8 },
  bubbleTail: {
    width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  bubble: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderLeftWidth: 3,
    padding: 20,
    minHeight: 100,
    justifyContent: 'center',
  },
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

  // Language toggle
  langBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14,
  },
  langBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

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
