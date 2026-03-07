/**
 * Full-screen modal for slide steps of the onboarding:
 *   step 0 — Welcome
 *   step 7 — Handoff
 *
 * Coach steps (1-6) are handled by CoachOverlay.
 */
import React from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding, TOTAL_ONBOARDING_STEPS } from '../contexts/OnboardingContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { trackOnboardingCompleted } from '../utils/analytics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Hero section ──────────────────────────────────────────────────────────────

function HeroSection({ emoji, gradient }: { emoji: string; gradient: [string, string] }) {
  return (
    <LinearGradient colors={gradient} style={styles.hero}>
      <Text style={styles.heroEmoji}>{emoji}</Text>
    </LinearGradient>
  );
}

// ── Step content ──────────────────────────────────────────────────────────────

function WelcomeStep({ childName }: { childName: string }) {
  const { colors } = useTheme();
  return (
    <>
      <HeroSection emoji="🎉" gradient={['#f97316', '#fb923c']} />
      <View style={styles.stepContent}>
        <Text style={styles.title}>Welcome to Your Story!</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {childName ? `${childName}'s story world is all set.` : "Your child's story world is all set."}
          {'\n\n'}Let's take a quick interactive tour before you hand it over.
        </Text>
      </View>
    </>
  );
}

function HandoffStep({ childName }: { childName: string }) {
  const { colors } = useTheme();
  return (
    <>
      <HeroSection emoji="🤗" gradient={['#10b981', '#34d399']} />
      <View style={styles.stepContent}>
        <Text style={styles.title}>All set!</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {childName
            ? `Hand the phone to ${childName} and watch the magic happen!`
            : 'Hand the phone to your child and watch the magic happen!'}
          {'\n\n'}After their first story, we'll ask you for quick feedback.
        </Text>
      </View>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const SLIDE_STEPS = new Set([0, 7]);

export default function OnboardingModal() {
  const { onboardingDone, onboardingStep, isLoading, advanceStep, completeOnboarding,
          preferredLanguage } = useOnboarding();
  const { userData } = useAuth();
  const { colors } = useTheme();

  const childName = userData?.name ?? '';

  // Only visible during slide steps
  const visible = !isLoading && !onboardingDone && SLIDE_STEPS.has(onboardingStep);

  const handleNext = async () => {
    if (onboardingStep === 7) {
      trackOnboardingCompleted(preferredLanguage);
      await completeOnboarding();
    } else {
      advanceStep();
    }
  };

  const isLastStep = onboardingStep === 7;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Step content — hero is rendered inside each step */}
        <View style={{ flex: 1 }}>
          {onboardingStep === 0 && <WelcomeStep childName={childName} />}
          {onboardingStep === 7 && <HandoffStep childName={childName} />}
        </View>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_ONBOARDING_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === onboardingStep ? '#f97316' : colors.surfaceBorder },
                i === onboardingStep && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Next button */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleNext}
            style={styles.nextBtnWrapper}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#f97316', '#fb923c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextBtn}
            >
              <Text style={styles.nextBtnText}>
                {isLastStep ? "Let's go!" : 'Next'}
              </Text>
              <Ionicons
                name={isLastStep ? 'checkmark' : 'arrow-forward'}
                size={18}
                color="#fff"
                style={{ marginLeft: 6 }}
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1 },
  hero:        { height: SCREEN_H * 0.38, justifyContent: 'center', alignItems: 'center' },
  heroEmoji:   { fontSize: 72, color: '#fff' },
  dotsRow:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 12 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  dotActive:   { width: 20, borderRadius: 3 },
  stepContent: { flex: 1, paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' },
  title:       { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 14, color: '#f97316' },
  subtitle:    { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 24 },
  footer:      { padding: 24, paddingBottom: 40 },
  nextBtnWrapper: { borderRadius: 16, overflow: 'hidden', shadowColor: '#f97316', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 12 },
  nextBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
