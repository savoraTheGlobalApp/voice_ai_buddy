/**
 * Amplitude analytics utility for tracking user events and retention.
 */
import { init, track, Identify, identify, setUserId } from '@amplitude/analytics-react-native';

const AMPLITUDE_API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY || '';

let isInitialized = false;

export const initAnalytics = () => {
  if (!AMPLITUDE_API_KEY) {
    console.warn('Amplitude API key not found - analytics disabled');
    return;
  }

  if (isInitialized) {
    return;
  }

  init(AMPLITUDE_API_KEY, undefined, {
    trackingOptions: {
      ipAddress: false, // Privacy: don't track IP
    },
  });

  isInitialized = true;
  console.log('Amplitude analytics initialized');
};

export const setUser = (userId: string) => {
  if (!isInitialized) return;
  setUserId(userId);
};

export const updateUserProperties = (properties: Record<string, any>) => {
  if (!isInitialized) return;

  const identifyObj = new Identify();
  Object.entries(properties).forEach(([key, value]) => {
    identifyObj.set(key, value);
  });
  identify(identifyObj);
};

// ── App lifecycle ──────────────────────────────────────────────────────────────

export const trackAppOpened = () => {
  if (!isInitialized) return;
  track('app_opened');
};

export const trackUserLogin = (method: string = 'firebase') => {
  if (!isInitialized) return;
  track('user_logged_in', { login_method: method });
};

export const trackUserSignedUp = (childName: string, childAge: number) => {
  if (!isInitialized) return;
  track('user_signed_up', { child_name: childName, child_age: childAge });
  updateUserProperties({ child_name: childName, child_age: childAge });
};

// ── Story Library ─────────────────────────────────────────────────────────────

export const trackStoryTapped = (storyId: string, category: string, position: 'featured' | 'list') => {
  if (!isInitialized) return;
  track('story_tapped', { story_id: storyId, category, position });
};

// ── Block Viewer ──────────────────────────────────────────────────────────────

export const trackStoryStarted = (storyId: string, category: string, totalSlides: number, language: string) => {
  if (!isInitialized) return;
  track('story_started', { story_id: storyId, category, total_slides: totalSlides, language });
};

export const trackSlideViewed = (storyId: string, category: string, slideIndex: number, blockType: string, timeSpentMs: number) => {
  if (!isInitialized) return;
  track('slide_viewed', { story_id: storyId, category, slide_index: slideIndex, block_type: blockType, time_spent_ms: timeSpentMs });
};

export const trackStoryLanguageSwitched = (storyId: string, fromLang: string, toLang: string, slideIndex: number) => {
  if (!isInitialized) return;
  track('story_language_switched', { story_id: storyId, from_language: fromLang, to_language: toLang, slide_index: slideIndex });
};

export const trackStoryCompleted = (storyId: string, category: string, totalTimeSec: number, slidesViewed: number) => {
  if (!isInitialized) return;
  track('story_completed', { story_id: storyId, category, total_time_seconds: totalTimeSec, slides_viewed: slidesViewed });
};

export const trackStoryAbandoned = (storyId: string, category: string, lastSlideIndex: number, completionPct: number) => {
  if (!isInitialized) return;
  track('story_abandoned', { story_id: storyId, category, last_slide_index: lastSlideIndex, completion_pct: completionPct });
};

export const trackNarratorButtonTapped = (storyId: string, category: string) => {
  if (!isInitialized) return;
  track('narrator_opened', { story_id: storyId, category });
};

// ── Narrator ──────────────────────────────────────────────────────────────────

export const trackNarratorPause = (storyId: string, blockIndex: number, blockType: string) => {
  if (!isInitialized) return;
  track('narrator_pause', { story_id: storyId, block_index: blockIndex, block_type: blockType });
};

export const trackNarratorLanguageSwitched = (storyId: string, blockIndex: number, fromLang: string, toLang: string) => {
  if (!isInitialized) return;
  track('narrator_language_switched', { story_id: storyId, block_index: blockIndex, from_language: fromLang, to_language: toLang });
};

export const trackNarratorBlockNavigated = (storyId: string, fromIndex: number, toIndex: number, blockType: string, method: 'button' | 'swipe' | 'auto') => {
  if (!isInitialized) return;
  track('narrator_block_navigated', { story_id: storyId, from_index: fromIndex, to_index: toIndex, block_type: blockType, method });
};

export const trackNarratorCompleted = (storyId: string, category: string, blocksHeard: number, totalBlocks: number) => {
  if (!isInitialized) return;
  track('narrator_completed', { story_id: storyId, category, blocks_heard: blocksHeard, total_blocks: totalBlocks });
};

// ── Onboarding & Feedback ──────────────────────────────────────────────────────

export const trackOnboardingCompleted = (language: 'en' | 'hi') => {
  if (!isInitialized) return;
  track('onboarding_completed', { preferred_language: language });
  updateUserProperties({ preferred_language: language });
};

export interface FeedbackRatings {
  overall: number;          // 1-5
  engagement: number;       // 1-5
  age_appropriateness: number; // 1-5
  audio_quality: number;    // 1-5
  comment?: string;
}

export const trackFeedbackSubmitted = (ratings: FeedbackRatings) => {
  if (!isInitialized) return;
  track('feedback_submitted', ratings);
};
