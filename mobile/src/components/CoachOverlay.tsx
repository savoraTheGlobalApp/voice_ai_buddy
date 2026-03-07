/**
 * Coach-mark overlay for guided onboarding steps 2–8.
 *
 * Renders a subtle dark tint over the screen + an instruction card.
 * Each UI element highlights itself via PulsingRing + useCoachHighlight().
 * pointerEvents="box-none" lets the actual UI remain tappable underneath.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding, COACH_STEP_MAP } from '../contexts/OnboardingContext';
import { useTheme } from '../contexts/ThemeContext';

const { height: H } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 60;

// ── Bouncing arrow ────────────────────────────────────────────────────────────

function BouncingArrow({ direction }: { direction: 'up' | 'down' | 'left' | 'right' }) {
  const anim = useRef(new Animated.Value(0)).current;
  const iconMap = { up: 'arrow-up', down: 'arrow-down', left: 'arrow-back', right: 'arrow-forward' } as const;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 8, duration: 450, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 450, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, []);

  const translate =
    direction === 'up'    ? [{ translateY: Animated.multiply(anim, -1) }] :
    direction === 'down'  ? [{ translateY: anim }] :
    direction === 'left'  ? [{ translateX: Animated.multiply(anim, -1) }] :
                            [{ translateX: anim }];

  return (
    <Animated.View style={{ transform: translate }}>
      <Ionicons name={iconMap[direction]} size={28} color="#f97316" />
    </Animated.View>
  );
}

// ── Config per step ───────────────────────────────────────────────────────────

const STEP_CONFIG = {
  'library-tab': {
    title: 'Open the Library',
    body: 'Tap the Library tab to browse sacred stories.',
    arrowDirection: 'down' as const,
    cardPosition: 'top-center' as const,
    skipLabel: 'Skip tour',
  },
  'tap-story': {
    title: 'Choose a Story',
    body: 'Tap any story card to open it and start reading.',
    arrowDirection: 'down' as const,
    cardPosition: 'top-center' as const,
    skipLabel: 'Skip',
  },
  'swipe-story': {
    title: 'Swipe Through the Story',
    body: 'Swipe left to move to the next part of the story.',
    arrowDirection: 'left' as const,
    cardPosition: 'top-center' as const,
    skipLabel: 'Skip',
  },
  'language-toggle': {
    title: 'Switch Language',
    body: 'Tap the language button to toggle between English and हिन्दी anytime.',
    arrowDirection: 'up' as const,
    cardPosition: 'bottom' as const,
    skipLabel: 'Skip',
  },
  'narrator-button': {
    title: 'Try the Narrator',
    body: "Tap the Listen button (top right) to hear the story read aloud.",
    arrowDirection: 'up' as const,
    cardPosition: 'bottom' as const,
    skipLabel: 'Skip',
  },
  'play-tab': {
    title: 'Go to Play',
    body: 'Tap the Play tab to get AI-curated stories for your child.',
    arrowDirection: 'down' as const,
    cardPosition: 'top-center' as const,
    skipLabel: 'Skip',
  },
  'start-story': {
    title: 'Start a Story Session',
    body: 'Tap Start Story to begin a narrated story session.',
    arrowDirection: 'up' as const,
    cardPosition: 'top-center' as const,
    skipLabel: 'Skip',
  },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachOverlay() {
  const { onboardingDone, isLoading, onboardingStep, advanceStep, skipCoachSteps } = useOnboarding();
  const { colors } = useTheme();
  const pathname = usePathname();
  const { bottom: bottomInset, top: topInset } = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const coachId = COACH_STEP_MAP[onboardingStep];
  const isCoachStep = !isLoading && !onboardingDone && coachId !== undefined;

  // Fade in when a new coach step becomes active
  useEffect(() => {
    if (isCoachStep) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [onboardingStep, isCoachStep]);

  // Detect navigation and auto-advance
  useEffect(() => {
    if (!isCoachStep) return;

    const p = pathname ?? '';
    if (coachId === 'library-tab' && p.includes('sacred-stories') && !p.includes('block-viewer') && !p.includes('narrator')) {
      setTimeout(advanceStep, 400);
    }
    if (coachId === 'tap-story' && (p.includes('block-viewer') || p.includes('content'))) {
      setTimeout(advanceStep, 400);
    }
    if (coachId === 'narrator-button' && p.includes('narrator') && !p.includes('play')) {
      setTimeout(advanceStep, 400);
    }
    if (coachId === 'play-tab' && p.includes('play') && !p.includes('narrator') && !p.includes('sacred-stories')) {
      setTimeout(advanceStep, 400);
    }
    if (coachId === 'start-story' && p.includes('play') && p.includes('narrator')) {
      setTimeout(advanceStep, 400);
    }
  }, [pathname, coachId, isCoachStep]);

  if (!isCoachStep) return null;

  const config = STEP_CONFIG[coachId];

  // Card position — fixed positions, not relative to spotlight
  const isTop = config.cardPosition === 'top-center';
  const cardStyle = isTop
    ? { top: topInset + 50, left: 16, right: 16 }
    : { bottom: bottomInset + TAB_BAR_HEIGHT + 20, left: 16, right: 16 };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fadeAnim, zIndex: 998 }]}
      pointerEvents="box-none"
    >
      {/* Subtle dark tint — light enough to see elements through */}
      <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none" />

      {/* Instruction card */}
      <View
        style={[styles.card, { backgroundColor: colors.surface }, cardStyle]}
        pointerEvents="auto"
      >
        <Text style={[styles.cardTitle, { color: colors.text }]}>{config.title}</Text>
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{config.body}</Text>

        <View style={styles.arrowRow}>
          <BouncingArrow direction={config.arrowDirection} />
        </View>

        <TouchableOpacity onPress={skipCoachSteps} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: colors.textTertiary }]}>{config.skipLabel}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    position: 'absolute',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardBody:  { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  arrowRow:  { alignItems: 'center', marginBottom: 8 },
  skipBtn:   { alignSelf: 'flex-end' },
  skipText:  { fontSize: 13, fontWeight: '600' },
});
