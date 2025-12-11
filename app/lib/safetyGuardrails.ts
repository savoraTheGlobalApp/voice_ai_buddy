/**
 * Safety Guardrails Module
 * Ensures age-appropriate, safe, and factually accurate content
 */

import { AgeGroup, SubAgeLevel, getAgeGroupFromSubLevel } from './ageGroups';

/**
 * Age-inappropriate topics to filter out
 */
const INAPPROPRIATE_TOPICS: Record<AgeGroup, string[]> = {
  early: [
    'violence', 'war', 'death', 'scary', 'horror', 'ghost', 'monster',
    'weapon', 'fight', 'blood', 'injury', 'accident', 'danger',
  ],
  elementary: [
    'violence', 'war', 'death', 'scary', 'horror', 'weapon',
    'politics', 'religion', 'controversy',
  ],
  upper: [
    'violence', 'war', 'death', 'weapon', 'politics', 'religion',
  ],
};

/**
 * Verify question is age-appropriate
 */
export function isAgeAppropriate(question: string, effectiveLevel: SubAgeLevel): boolean {
  const ageGroup = getAgeGroupFromSubLevel(effectiveLevel);
  const inappropriate = INAPPROPRIATE_TOPICS[ageGroup];
  const questionLower = question.toLowerCase();
  
  // Check for inappropriate topics
  for (const topic of inappropriate) {
    if (questionLower.includes(topic)) {
      console.warn(`[SafetyGuardrails] Filtered question containing inappropriate topic: ${topic}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Verify fact comes from curated database (Phase 1)
 * Phase 2: Will check against Knowledge Graph
 */
export function verifyFact(fact: string, source: 'curated' | 'llm'): boolean {
  // For Phase 1, we only use curated facts
  // If source is 'llm', we should reject it
  if (source === 'llm') {
    console.warn('[SafetyGuardrails] Rejected LLM-generated fact (not from curated database)');
    return false;
  }
  
  return true;
}

/**
 * Check sentiment is positive and encouraging
 */
export function hasPositiveSentiment(text: string): boolean {
  const negativeWords = ['hate', 'stupid', 'dumb', 'boring', 'terrible', 'awful', 'bad'];
  const textLower = text.toLowerCase();
  
  // Check for negative words
  for (const word of negativeWords) {
    if (textLower.includes(word)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Comprehensive safety check
 */
export function validateQuestion(question: string, effectiveLevel: SubAgeLevel): {
  isValid: boolean;
  reason?: string;
} {
  // Check age-appropriateness
  if (!isAgeAppropriate(question, effectiveLevel)) {
    return { isValid: false, reason: 'Contains age-inappropriate content' };
  }
  
  // Check sentiment
  if (!hasPositiveSentiment(question)) {
    return { isValid: false, reason: 'Contains negative sentiment' };
  }
  
  return { isValid: true };
}

