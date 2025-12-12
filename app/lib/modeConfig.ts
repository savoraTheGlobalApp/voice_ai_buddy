/**
 * Mode Selection Configuration
 * Configurable thresholds and parameters for state machine
 */

import { AgeGroup } from './ageGroups';

/**
 * Configuration for mode selection thresholds
 */
export interface ModeSelectionConfig {
  // LLM intent combination
  llmIntentMinConfidence: number;        // Minimum LLM confidence to use (default: 60)
  llmIntentDecayRate: number;            // Decay per turn (default: 0.9)
  
  // Mode diversity
  modeOveruseThreshold: number;          // % threshold for overuse (default: 0.3 = 30%)
  minHistoryForDiversity: number;        // Min turns needed for diversity check (default: 3)
  
  // Confusion handling (age-based)
  confusionThresholds: Record<AgeGroup, number>;  // Streak threshold before explain
  
  // Question handling
  questionStreakThresholds: Record<AgeGroup, number>;
  
  // Boredom handling
  boredomQuestionStreakThreshold: number;  // When to try social/teach (default: 2)
  
  // Teach mode
  teachModeEngagementStreak: number;        // Min streak for teach (default: 3)
  teachModeProbability: number;             // Probability when eligible (default: 0.45)
  
  // Social mode
  socialModeRotationInterval: number;       // Every N turns (default: 5)
  socialModeMinTurnsWithout: number;       // Min turns without social (default: 3)
  socialModeEntertainmentProbability: number; // For story/joke requests (default: 0.2)
  
  // Statement mode distribution (by age group)
  statementModeDistribution: Record<AgeGroup, {
    encourage: number;
    learning: number;  // probe/hint
    engage: number;
    teach?: number;    // Only for upper
  }>;
  
  // Signal fusion
  criticalSignalMinConfidence: number;     // For confusion/boredom (default: 70)
  
  // Engagement detection
  engagementMinLength: number;             // Characters (default: 50)
  engagementMinWords: number;              // Words (default: 10)
  
  // Safety
  unsafePatternWordBoundary: boolean;      // Use word boundaries (default: true)
}

/**
 * Default configuration
 */
export const DEFAULT_MODE_CONFIG: ModeSelectionConfig = {
  llmIntentMinConfidence: 60,
  llmIntentDecayRate: 0.9,
  
  modeOveruseThreshold: 0.3,
  minHistoryForDiversity: 3,
  
  confusionThresholds: {
    early: 1,      // Explain after 1 turn of confusion for early ages
    elementary: 2,
    upper: 2,
  },
  
  questionStreakThresholds: {
    early: 2,
    elementary: 3,
    upper: 4,
  },
  
  boredomQuestionStreakThreshold: 2,
  
  teachModeEngagementStreak: 3,
  teachModeProbability: 0.45,
  
  socialModeRotationInterval: 5,
  socialModeMinTurnsWithout: 3,
  socialModeEntertainmentProbability: 0.2,
  
  statementModeDistribution: {
    early: {
      encourage: 0.3,
      learning: 0.4,
      engage: 0.3,
    },
    elementary: {
      encourage: 0.25,
      learning: 0.3,
      engage: 0.25,
      // Remaining 20% for other modes
    },
    upper: {
      encourage: 0.2,
      learning: 0.3,
      engage: 0.2,
      teach: 0.15,
      // Remaining 15% for other modes
    },
  },
  
  criticalSignalMinConfidence: 70,
  
  engagementMinLength: 50,
  engagementMinWords: 10,
  
  unsafePatternWordBoundary: true,
};

/**
 * Get configuration (allows override in future)
 */
export function getModeConfig(): ModeSelectionConfig {
  return DEFAULT_MODE_CONFIG;
}

