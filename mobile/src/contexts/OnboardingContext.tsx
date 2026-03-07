/**
 * Tracks parent onboarding state and post-session feedback.
 * All state is local (AsyncStorage) — no backend needed.
 *
 * Onboarding step sequence:
 *   0 → slide: Welcome
 *   1 → slide: Language picker
 *   2 → coach: Library tab     (user taps Library → auto-advance)
 *   3 → coach: Tap a story     (user taps story card → auto-advance)
 *   4 → coach: Narrator button (user taps 🎧 → auto-advance)
 *   5 → slide: Handoff
 *   done
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  onboardingCompleted: '@onboarding_completed',
  preferredLanguage:   '@preferred_language',
  feedbackGiven:       '@feedback_given',
};

export const TOTAL_ONBOARDING_STEPS = 8; // 0-7

export type CoachStepId = 'library-tab' | 'tap-story' | 'swipe-story' | 'language-toggle' | 'narrator-button' | 'play-tab' | 'start-story';

export const COACH_STEP_MAP: Record<number, CoachStepId> = {
  1: 'library-tab',
  2: 'tap-story',
  3: 'swipe-story',
  4: 'narrator-button',
  5: 'play-tab',
  6: 'start-story',
};

interface OnboardingContextType {
  // Onboarding
  onboardingDone: boolean;
  onboardingStep: number;           // 0-5, or TOTAL_ONBOARDING_STEPS when done
  preferredLanguage: 'en' | 'hi';
  setPreferredLanguage: (l: 'en' | 'hi') => void;
  advanceStep: () => void;          // move to next step
  skipCoachSteps: () => void;       // skip all coach steps → go to Handoff slide
  completeOnboarding: () => Promise<void>; // called at step 9
  onStorySwiped: () => void;        // advance 'swipe-story' coach step
  onLanguageToggled: () => void;    // advance 'language-toggle' coach step

  // Post-session feedback
  feedbackGiven: boolean;
  showFeedback: boolean;
  triggerFeedback: () => void;
  completeFeedback: () => Promise<void>;
  dismissFeedback: () => void;

  isLoading: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'hi'>('en');
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [done, lang, feedback] = await AsyncStorage.multiGet([
          KEYS.onboardingCompleted,
          KEYS.preferredLanguage,
          KEYS.feedbackGiven,
        ]);
        if (done[1] === 'true') setOnboardingDone(true);
        if (lang[1] === 'hi') setPreferredLanguage('hi');
        if (feedback[1] === 'true') setFeedbackGiven(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const advanceStep = () =>
    setOnboardingStep((s) => Math.min(s + 1, TOTAL_ONBOARDING_STEPS));

  // Skip all remaining coach steps and go straight to the Handoff slide (step 8)
  const skipCoachSteps = () => setOnboardingStep(TOTAL_ONBOARDING_STEPS - 1);

  const onStorySwiped = () => {
    setOnboardingStep((s) => {
      if (COACH_STEP_MAP[s] === 'swipe-story') return Math.min(s + 1, TOTAL_ONBOARDING_STEPS);
      return s;
    });
  };

  const onLanguageToggled = () => {
    setOnboardingStep((s) => {
      if (COACH_STEP_MAP[s] === 'language-toggle') return Math.min(s + 1, TOTAL_ONBOARDING_STEPS);
      return s;
    });
  };

  const completeOnboarding = async () => {
    setOnboardingDone(true);
    await AsyncStorage.multiSet([
      [KEYS.onboardingCompleted, 'true'],
      [KEYS.preferredLanguage, preferredLanguage],
    ]);
  };

  const triggerFeedback = () => {
    if (!feedbackGiven) setShowFeedback(true);
  };

  const completeFeedback = async () => {
    setFeedbackGiven(true);
    setShowFeedback(false);
    await AsyncStorage.setItem(KEYS.feedbackGiven, 'true');
  };

  const dismissFeedback = () => setShowFeedback(false);

  return (
    <OnboardingContext.Provider value={{
      onboardingDone,
      onboardingStep,
      preferredLanguage,
      setPreferredLanguage,
      advanceStep,
      skipCoachSteps,
      completeOnboarding,
      onStorySwiped,
      onLanguageToggled,
      feedbackGiven,
      showFeedback,
      triggerFeedback,
      completeFeedback,
      dismissFeedback,
      isLoading,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

/** Returns true when the given coach step is the currently active step. */
export function useCoachHighlight(stepId: CoachStepId): boolean {
  const ctx = useContext(OnboardingContext);
  if (!ctx) return false;
  const { onboardingDone, isLoading, onboardingStep } = ctx;
  return !isLoading && !onboardingDone && COACH_STEP_MAP[onboardingStep] === stepId;
}
