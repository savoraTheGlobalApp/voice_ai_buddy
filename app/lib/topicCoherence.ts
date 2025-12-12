/**
 * Topic Coherence & Engagement Balancer
 * Decides whether to stay on the current topic or switch when engagement drops
 */

import { ModeState } from './responseMode';

export interface TopicDecision {
  currentTopic: string | null;
  nextTopic: string | null;
  maintain: boolean;
  reason?: 'child_switch' | 'disengaged' | 'no_topic';
}

const SHORT_RESPONSES = ['i don\'t know', 'idk', 'dunno', 'yes', 'no', 'ok', 'okay', 'k', 'maybe'];

/**
 * Very lightweight topic extraction via keyword scan.
 * For phase 1, we just return the longest word > 3 chars (best-effort).
 */
export function extractTopic(message: string): string | null {
  if (!message) return null;
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
  if (words.length === 0) return null;
  // Pick the longest word as a proxy for topic
  return words.sort((a, b) => b.length - a.length)[0];
}

export function isShortResponse(message: string): boolean {
  if (!message) return true;
  const normalized = message.toLowerCase().trim();
  if (normalized.length <= 3) return true;
  if (SHORT_RESPONSES.includes(normalized)) return true;
  if (normalized.split(/\s+/).length <= 2) return true;
  return false;
}

function hasDisengagementSignals(recentUserMessages: string[], modeState?: ModeState): boolean {
  const shortCount = recentUserMessages.filter(m => isShortResponse(m)).length;
  // Phase 1: we only use short responses as disengagement proxy
  return shortCount >= 2;
}

/**
 * Topic families for simple semantic relatedness checks.
 * This is a coarse map to avoid jumping to unrelated topics.
 */
const TOPIC_FAMILIES: Record<string, string[]> = {
  animals: ['animal', 'bat', 'shark', 'panther', 'cat', 'dog', 'bear', 'fish', 'bird'],
  food: ['food', 'eat', 'meat', 'fruit', 'insect', 'berry', 'banana', 'strawberry'],
  places: ['ocean', 'sea', 'forest', 'jungle', 'desert', 'mountain', 'city', 'meeting'],
  people: ['person', 'people', 'friends', 'family'],
};

function topicFamily(topic: string | null): string | null {
  if (!topic) return null;
  for (const [family, terms] of Object.entries(TOPIC_FAMILIES)) {
    if (terms.some(t => topic.includes(t) || t.includes(topic))) return family;
  }
  return null;
}

function areRelatedTopics(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const fa = topicFamily(a);
  const fb = topicFamily(b);
  if (!fa || !fb) return false;
  return fa === fb;
}

function maybeTypoIntentRepair(currentTopic: string | null, candidate: string | null): boolean {
  if (!candidate || !currentTopic) return false;
  // Simple heuristic: meeting vs meat
  if (candidate === 'meeting' && currentTopic.includes('eat')) return true;
  return false;
}

/**
 * Decide whether to maintain or switch topic.
 * - If child explicitly talks about a new topic (new keyword), switch to it.
 * - If engagement is low AND new topic is related, allow switch.
 * - Otherwise, maintain current topic.
 */
export function decideTopicAction(
  currentTopic: string | null,
  userMessage: string,
  recentUserMessages: string[],
  modeState?: ModeState
): TopicDecision {
  const newTopic = extractTopic(userMessage);
  const disengaged = hasDisengagementSignals(recentUserMessages, modeState);
  const related = areRelatedTopics(currentTopic, newTopic);
  const typoRepair = maybeTypoIntentRepair(currentTopic, newTopic);

  // Child brings a new topic -> follow their lead
  if (newTopic && currentTopic && newTopic !== currentTopic) {
    // Only pivot if related OR typo repair; else maintain and clarify
    if (related || typoRepair) {
      return { currentTopic, nextTopic: newTopic, maintain: false, reason: 'child_switch' };
    }
    // Not related: maintain current topic
    return { currentTopic, nextTopic: currentTopic, maintain: true };
  }

  // Disengaged -> allow switch only if related; else maintain
  if (disengaged) {
    if (related) {
      return { currentTopic, nextTopic: newTopic || currentTopic, maintain: false, reason: 'disengaged' };
    }
    return { currentTopic, nextTopic: currentTopic, maintain: true };
  }

  // No topic yet -> set if available
  if (!currentTopic && newTopic) {
    return { currentTopic: newTopic, nextTopic: newTopic, maintain: true, reason: 'no_topic' };
  }

  // Default: maintain
  return { currentTopic, nextTopic: currentTopic, maintain: true };
}

