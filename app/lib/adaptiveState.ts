/**
 * Adaptive State Management
 * Tracks user's effective learning level and manages transitions
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { SubAgeLevel, getSubAgeLevel, getNextLevel, getPreviousLevel, getAgeGroupFromSubLevel, getAllSubLevels } from './ageGroups';
import { CapabilityMetrics, CapabilityScore, analyzeRecentConversation, calculateCapabilityScore } from './capabilityMetrics';
import { ConversationMessage } from '@/lib/conversations';

export interface TransitionEvent {
  from: SubAgeLevel;
  to: SubAgeLevel;
  reason: string;                   // Why transition occurred
  confidence: number;                // 0-100, confidence in transition
  timestamp: Timestamp;
  metrics: CapabilityScore;         // Metrics that triggered transition
}

export interface AdaptiveState {
  uid: string;
  chronologicalAge: number;        // User's actual age
  effectiveLevel: SubAgeLevel;     // Current effective level (can differ from age)
  capabilityScore: CapabilityScore; // Current capability assessment
  lastUpdated: Timestamp;
  
  // Transition tracking
  transitionHistory: TransitionEvent[];
  currentStreak: {
    direction: 'up' | 'down' | 'stable';
    count: number;                  // Consecutive signals in same direction
    startTime: Timestamp;
  };
  
  // Session state
  sessionMetrics: CapabilityMetrics;
  messageCount: number;              // Messages analyzed in current session
}

/**
 * Transition evaluation result
 */
export interface TransitionEvaluation {
  shouldTransition: boolean;
  newLevel?: SubAgeLevel;
  confidence: number;
  reason: string;
  direction?: 'up' | 'down';
}

// Transition thresholds
const UPWARD_THRESHOLD = 75;        // Capability score needed for upward transition
const DOWNWARD_THRESHOLD = 40;      // Capability score needed for downward transition
const STREAK_REQUIRED = 5;          // Consecutive signals needed
const CONFIDENCE_THRESHOLD = 70;    // Minimum confidence for transition
const MAJOR_GROUP_THRESHOLD_UP = 85; // For crossing major age groups (upward)
const MAJOR_GROUP_THRESHOLD_DOWN = 30; // For crossing major age groups (downward)
const MAJOR_GROUP_STREAK = 10;      // Consecutive signals for major group transition
const MAJOR_GROUP_CONFIDENCE = 85;  // Confidence for major group transition

/**
 * Initializes a new adaptive state for a user
 */
export async function initializeAdaptiveState(uid: string, age: number): Promise<AdaptiveState> {
  const initialLevel = getSubAgeLevel(age) || 'early_mid'; // Default fallback
  
  const state: AdaptiveState = {
    uid,
    chronologicalAge: age,
    effectiveLevel: initialLevel,
    capabilityScore: {
      overall: 50,
      language: 50,
      reasoning: 50,
      engagement: 50,
      confidence: 0,
    },
    lastUpdated: Timestamp.now(),
    transitionHistory: [],
    currentStreak: {
      direction: 'stable',
      count: 0,
      startTime: Timestamp.now(),
    },
    sessionMetrics: {
      avgResponseLength: 0,
      maxResponseLength: 0,
      vocabularySophistication: 0,
      sentenceComplexity: 0,
      questionDepth: 0,
      topicComplexity: 0,
      engagementFrequency: 0,
      confusionCount: 0,
      repetitionRequests: 0,
      simplificationRequests: 0,
      advancedQuestions: 0,
      vocabularyUsage: 0,
      extendedResponses: 0,
    },
    messageCount: 0,
  };

  await saveAdaptiveState(state);
  return state;
}

/**
 * Loads adaptive state from Firestore
 */
export async function loadAdaptiveState(uid: string): Promise<AdaptiveState | null> {
  try {
    const ref = doc(db, 'users', uid, 'adaptiveState', 'current');
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      return null;
    }

    const data = snap.data();
    
    // Convert Firestore timestamps
    const convertTimestamp = (ts: any): Timestamp => {
      if (ts?.toDate) return Timestamp.fromDate(ts.toDate());
      if (ts?.seconds) return Timestamp.fromMillis(ts.seconds * 1000);
      return Timestamp.now();
    };

    return {
      uid: data.uid,
      chronologicalAge: data.chronologicalAge,
      effectiveLevel: data.effectiveLevel,
      capabilityScore: data.capabilityScore,
      lastUpdated: convertTimestamp(data.lastUpdated),
      transitionHistory: (data.transitionHistory || []).map((t: any) => ({
        ...t,
        timestamp: convertTimestamp(t.timestamp),
      })),
      currentStreak: {
        ...data.currentStreak,
        startTime: convertTimestamp(data.currentStreak?.startTime),
      },
      sessionMetrics: data.sessionMetrics || {
        avgResponseLength: 0,
        maxResponseLength: 0,
        vocabularySophistication: 0,
        sentenceComplexity: 0,
        questionDepth: 0,
        topicComplexity: 0,
        engagementFrequency: 0,
        confusionCount: 0,
        repetitionRequests: 0,
        simplificationRequests: 0,
        advancedQuestions: 0,
        vocabularyUsage: 0,
        extendedResponses: 0,
      },
      messageCount: data.messageCount || 0,
    };
  } catch (error) {
    console.error('[AdaptiveState] Error loading state:', error);
    return null;
  }
}

/**
 * Saves adaptive state to Firestore
 */
export async function saveAdaptiveState(state: AdaptiveState): Promise<void> {
  try {
    const ref = doc(db, 'users', state.uid, 'adaptiveState', 'current');
    await setDoc(ref, {
      ...state,
      lastUpdated: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('[AdaptiveState] Error saving state:', error);
    throw error;
  }
}

/**
 * Updates state with new capability metrics
 */
export function updateStateWithMetrics(
  state: AdaptiveState,
  metrics: CapabilityMetrics
): AdaptiveState {
  const recentMessages = state.messageCount + 1;
  const capabilityScore = calculateCapabilityScore(metrics, recentMessages);

  // Update streak
  let newStreak = { ...state.currentStreak };
  const scoreDiff = capabilityScore.overall - state.capabilityScore.overall;
  
  if (scoreDiff > 5) {
    // Improving
    if (newStreak.direction === 'up') {
      newStreak.count++;
    } else {
      newStreak = { direction: 'up', count: 1, startTime: Timestamp.now() };
    }
  } else if (scoreDiff < -5) {
    // Declining
    if (newStreak.direction === 'down') {
      newStreak.count++;
    } else {
      newStreak = { direction: 'down', count: 1, startTime: Timestamp.now() };
    }
  } else {
    // Stable
    if (newStreak.direction === 'stable') {
      newStreak.count++;
    } else {
      newStreak = { direction: 'stable', count: 1, startTime: Timestamp.now() };
    }
  }

  return {
    ...state,
    capabilityScore,
    sessionMetrics: metrics,
    messageCount: recentMessages,
    currentStreak: newStreak,
    lastUpdated: Timestamp.now(),
  };
}

/**
 * Checks if a transition would cross a major age group boundary
 */
function isMajorGroupTransition(from: SubAgeLevel, to: SubAgeLevel): boolean {
  const fromGroup = getAgeGroupFromSubLevel(from);
  const toGroup = getAgeGroupFromSubLevel(to);
  return fromGroup !== toGroup;
}

/**
 * Checks if a level is within acceptable range from chronological age
 */
function isLevelWithinBounds(level: SubAgeLevel, chronologicalAge: number): boolean {
  const ageLevel = getSubAgeLevel(chronologicalAge);
  if (!ageLevel) return true; // Allow if age is invalid

  const allLevels = ['early_low', 'early_mid', 'early_high', 'elem_low', 'elem_mid', 'elem_high', 'upper_low', 'upper_mid', 'upper_high'];
  const ageIndex = allLevels.indexOf(ageLevel);
  const levelIndex = allLevels.indexOf(level);

  // Don't allow more than 2 sub-levels below chronological age
  // Don't restrict upward transitions (allow advanced children)
  if (levelIndex < ageIndex - 2) {
    return false;
  }

  return true;
}

/**
 * Evaluates whether a transition should occur
 */
export function evaluateTransition(
  currentState: AdaptiveState,
  newMetrics: CapabilityMetrics
): TransitionEvaluation {
  const score = calculateCapabilityScore(newMetrics, currentState.messageCount);
  const currentLevel = currentState.effectiveLevel;
  const streak = currentState.currentStreak;

  // Need minimum messages for reliable assessment
  if (currentState.messageCount < 5) {
    return {
      shouldTransition: false,
      confidence: 0,
      reason: 'Insufficient data for transition assessment',
    };
  }

  // Check for upward transition
  if (score.overall >= UPWARD_THRESHOLD && 
      streak.direction === 'up' && 
      streak.count >= STREAK_REQUIRED &&
      score.confidence >= CONFIDENCE_THRESHOLD) {
    
    const nextLevel = getNextLevel(currentLevel);
    if (!nextLevel) {
      return {
        shouldTransition: false,
        confidence: 0,
        reason: 'Already at highest level',
      };
    }

    // Check if major group transition
    const isMajor = isMajorGroupTransition(currentLevel, nextLevel);
    if (isMajor) {
      // Stricter requirements for major group transitions
      if (score.overall >= MAJOR_GROUP_THRESHOLD_UP &&
          streak.count >= MAJOR_GROUP_STREAK &&
          score.confidence >= MAJOR_GROUP_CONFIDENCE) {
        return {
          shouldTransition: true,
          newLevel: nextLevel,
          confidence: score.confidence,
          reason: `Major upward transition: Capability score ${score.overall}, ${streak.count} consecutive upward signals`,
          direction: 'up',
        };
      }
      return {
        shouldTransition: false,
        confidence: score.confidence,
        reason: 'Major group transition requires higher confidence',
      };
    }

    // Regular upward transition
    return {
      shouldTransition: true,
      newLevel: nextLevel,
      confidence: score.confidence,
      reason: `Upward transition: Capability score ${score.overall}, ${streak.count} consecutive upward signals`,
      direction: 'up',
    };
  }

  // Check for downward transition
  if (score.overall <= DOWNWARD_THRESHOLD &&
      streak.direction === 'down' &&
      streak.count >= STREAK_REQUIRED &&
      score.confidence >= CONFIDENCE_THRESHOLD) {
    
    const prevLevel = getPreviousLevel(currentLevel);
    if (!prevLevel) {
      return {
        shouldTransition: false,
        confidence: 0,
        reason: 'Already at lowest level',
      };
    }

    // Check bounds (don't go too far below chronological age)
    if (!isLevelWithinBounds(prevLevel, currentState.chronologicalAge)) {
      return {
        shouldTransition: false,
        confidence: 0,
        reason: 'Cannot transition below chronological age bounds',
      };
    }

    // Check if major group transition
    const isMajor = isMajorGroupTransition(currentLevel, prevLevel);
    if (isMajor) {
      // Stricter requirements for major group transitions
      if (score.overall <= MAJOR_GROUP_THRESHOLD_DOWN &&
          streak.count >= MAJOR_GROUP_STREAK &&
          score.confidence >= MAJOR_GROUP_CONFIDENCE) {
        return {
          shouldTransition: true,
          newLevel: prevLevel,
          confidence: score.confidence,
          reason: `Major downward transition: Capability score ${score.overall}, ${streak.count} consecutive downward signals`,
          direction: 'down',
        };
      }
      return {
        shouldTransition: false,
        confidence: score.confidence,
        reason: 'Major group transition requires higher confidence',
      };
    }

    // Regular downward transition
    return {
      shouldTransition: true,
      newLevel: prevLevel,
      confidence: score.confidence,
      reason: `Downward transition: Capability score ${score.overall}, ${streak.count} consecutive downward signals`,
      direction: 'down',
    };
  }

  return {
    shouldTransition: false,
    confidence: score.confidence,
    reason: `No transition: Score ${score.overall}, Streak ${streak.direction} (${streak.count})`,
  };
}

/**
 * Applies a transition to the state
 */
export function applyTransition(
  state: AdaptiveState,
  evaluation: TransitionEvaluation
): AdaptiveState {
  if (!evaluation.shouldTransition || !evaluation.newLevel) {
    return state;
  }

  const transitionEvent: TransitionEvent = {
    from: state.effectiveLevel,
    to: evaluation.newLevel,
    reason: evaluation.reason,
    confidence: evaluation.confidence,
    timestamp: Timestamp.now(),
    metrics: state.capabilityScore,
  };

  return {
    ...state,
    effectiveLevel: evaluation.newLevel,
    transitionHistory: [...state.transitionHistory, transitionEvent],
    currentStreak: {
      direction: 'stable',
      count: 0,
      startTime: Timestamp.now(),
    },
    lastUpdated: Timestamp.now(),
  };
}

/**
 * Analyzes conversation and updates state
 */
export async function analyzeAndUpdateState(
  state: AdaptiveState,
  conversationHistory: ConversationMessage[],
  uid: string
): Promise<{ state: AdaptiveState; transition?: TransitionEvaluation }> {
  // Analyze recent conversation
  const metrics = analyzeRecentConversation(conversationHistory, 15);
  
  // Update state with new metrics
  let updatedState = updateStateWithMetrics(state, metrics);
  
  // Evaluate transition
  const transition = evaluateTransition(updatedState, metrics);
  
  // Apply transition if needed
  if (transition.shouldTransition) {
    updatedState = applyTransition(updatedState, transition);
    console.log(`[Adaptive] Transition: ${transition.reason}`);
  }
  
  // Save state periodically (every 5 messages)
  if (updatedState.messageCount % 5 === 0) {
    await saveAdaptiveState(updatedState);
  }
  
  return { state: updatedState, transition: transition.shouldTransition ? transition : undefined };
}

/**
 * Updates chronological age and sets effective level to match the new age
 */
export async function updateAdaptiveStateAge(uid: string, newAge: number): Promise<void> {
  try {
    const state = await loadAdaptiveState(uid);
    if (!state) {
      // If no state exists, initialize it with new age
      await initializeAdaptiveState(uid, newAge);
      return;
    }

    const newAgeLevel = getSubAgeLevel(newAge);
    if (!newAgeLevel) {
      console.warn('[AdaptiveState] Invalid age for update:', newAge);
      return;
    }

    // Update chronological age and set effective level to match the new age
    const updatedState: AdaptiveState = {
      ...state,
      chronologicalAge: newAge,
      effectiveLevel: newAgeLevel, // Strictly set to match the new age
      lastUpdated: Timestamp.now(),
    };

    // Log the update if level changed
    if (state.effectiveLevel !== newAgeLevel) {
      console.log(`[AdaptiveState] Updated effective level from ${state.effectiveLevel} to ${newAgeLevel} due to age update from ${state.chronologicalAge} to ${newAge}`);
    } else {
      console.log(`[AdaptiveState] Updated chronological age from ${state.chronologicalAge} to ${newAge} (effective level unchanged: ${newAgeLevel})`);
    }

    await saveAdaptiveState(updatedState);
  } catch (error) {
    console.error('[AdaptiveState] Error updating age:', error);
    throw error;
  }
}

