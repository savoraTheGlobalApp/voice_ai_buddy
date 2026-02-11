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

// App lifecycle events
export const trackAppOpened = () => {
  if (!isInitialized) return;
  track('app_opened');
};

export const trackUserLogin = (method: string = 'firebase') => {
  if (!isInitialized) return;
  track('user_logged_in', { login_method: method });
};

// Story events
export const trackStoryViewed = (storyId: string, storyTitle: string, category: string) => {
  if (!isInitialized) return;
  track('story_viewed', {
    story_id: storyId,
    story_title: storyTitle,
    category: category,
  });
};

export const trackStoryStarted = (storyId: string, category: string) => {
  if (!isInitialized) return;
  track('story_started', {
    story_id: storyId,
    category: category,
  });
};

export const trackSegmentCompleted = (storyId: string, segmentIndex: number) => {
  if (!isInitialized) return;
  track('story_segment_completed', {
    story_id: storyId,
    segment_index: segmentIndex,
  });
};

export const trackStoryCompleted = (storyId: string, category: string, readingTimeSeconds: number) => {
  if (!isInitialized) return;
  track('story_completed', {
    story_id: storyId,
    category: category,
    reading_time_seconds: readingTimeSeconds,
  });
};

export const trackDiscussionAnswered = (storyId: string, segmentIndex: number) => {
  if (!isInitialized) return;
  track('discussion_answered', {
    story_id: storyId,
    segment_index: segmentIndex,
  });
};

// Character events
export const trackCharacterUnlocked = (characterId: string, characterName: string) => {
  if (!isInitialized) return;
  track('character_unlocked', {
    character_id: characterId,
    character_name: characterName,
  });
};

export const trackCharacterViewed = (characterId: string) => {
  if (!isInitialized) return;
  track('character_viewed', {
    character_id: characterId,
  });
};

// Language events
export const trackLanguageSwitched = (fromLang: string, toLang: string, screen: string) => {
  if (!isInitialized) return;
  track('language_switched', {
    from_language: fromLang,
    to_language: toLang,
    screen: screen,
  });

  // Also update user property
  updateUserProperties({ preferred_language: toLang });
};

// Monetization events
export const trackPaywallSeen = (trigger: string) => {
  if (!isInitialized) return;
  track('paywall_seen', {
    trigger: trigger,
  });
};

export const trackSubscriptionStarted = (plan: string, price: number) => {
  if (!isInitialized) return;
  track('subscription_started', {
    plan: plan,
    price: price,
  });

  // Update user property
  updateUserProperties({
    subscription_tier: 'paid',
    plan: plan,
  });
};

export const trackSubscriptionCancelled = (reason?: string) => {
  if (!isInitialized) return;
  track('subscription_cancelled', {
    reason: reason,
  });

  updateUserProperties({
    subscription_tier: 'free',
  });
};

// Navigation events
export const trackScreenViewed = (screenName: string) => {
  if (!isInitialized) return;
  track('screen_viewed', {
    screen_name: screenName,
  });
};

export default {
  initAnalytics,
  setUser,
  updateUserProperties,
  trackAppOpened,
  trackUserLogin,
  trackStoryViewed,
  trackStoryStarted,
  trackSegmentCompleted,
  trackStoryCompleted,
  trackDiscussionAnswered,
  trackCharacterUnlocked,
  trackCharacterViewed,
  trackLanguageSwitched,
  trackPaywallSeen,
  trackSubscriptionStarted,
  trackSubscriptionCancelled,
  trackScreenViewed,
};
