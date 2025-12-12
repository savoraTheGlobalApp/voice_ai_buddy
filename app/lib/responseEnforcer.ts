/**
 * Response Enforcer
 * Soft enforcement of response constraints with logging
 */

import { ResponseMode, ModePolicy, MODE_POLICIES, UserIntent } from './responseMode';
import { LanguageParams } from './modePrompts';

/**
 * Validation result from soft enforcement
 */
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  questionCount: number;
  wordCount: number;
  hasAnalogy: boolean;
  hasFact: boolean;
}

/**
 * Count questions in response text
 */
function countQuestions(text: string): number {
  // Count question marks
  const questionMarks = (text.match(/\?/g) || []).length;
  return questionMarks;
}

/**
 * Count words in response text
 */
function countWords(text: string): number {
  // Remove intent tag if present
  const cleanText = text.replace(/\[INTENT:\s*\w+\]/gi, '').trim();
  if (!cleanText) return 0;
  return cleanText.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if response contains an analogy or example
 */
function hasAnalogy(text: string): boolean {
  const analogyPatterns = [
    /like (how|when|a)/i,
    /as if/i,
    /for example/i,
    /imagine/i,
    /think of/i,
    /similar to/i,
    /just like/i,
    /it's like/i,
    /same as/i,
    /remember when/i,
    /you know how/i,
  ];
  return analogyPatterns.some(p => p.test(text));
}

/**
 * Check if response contains an interesting fact
 */
function hasFact(text: string): boolean {
  const factPatterns = [
    /did you know/i,
    /fun fact/i,
    /interesting(ly)?/i,
    /actually/i,
    /in fact/i,
    /scientists (say|found|discovered)/i,
    /the reason (is|why)/i,
    /this happens because/i,
    /that's because/i,
  ];
  return factPatterns.some(p => p.test(text));
}

/**
 * Parse word count range from string like "10-15 words"
 */
function parseWordRange(wordCountRange: string): { min: number; max: number } {
  const match = wordCountRange.match(/(\d+)-(\d+)/);
  if (match) {
    return { min: parseInt(match[1]), max: parseInt(match[2]) };
  }
  return { min: 10, max: 20 }; // Default
}

/**
 * Validate response against mode policy (soft enforcement - logs warnings only)
 */
export function validateResponse(
  response: string,
  mode: ResponseMode,
  langParams: LanguageParams
): ValidationResult {
  const policy = MODE_POLICIES[mode];
  const warnings: string[] = [];
  
  // Count questions
  const questionCount = countQuestions(response);
  if (questionCount > policy.maxQuestions) {
    warnings.push(
      `Response has ${questionCount} questions (max: ${policy.maxQuestions} for ${mode} mode)`
    );
  }
  
  // Count words
  const wordCount = countWords(response);
  const wordRange = parseWordRange(langParams.wordCountRange);
  const adjustedMax = Math.round(wordRange.max * policy.wordBudgetMultiplier * 1.5); // 50% buffer
  if (wordCount > adjustedMax) {
    warnings.push(
      `Response has ${wordCount} words (target: ${wordRange.min}-${wordRange.max} for ${mode} mode)`
    );
  }
  
  // Check for required analogy
  const foundAnalogy = hasAnalogy(response);
  if (policy.requiresAnalogy && !foundAnalogy) {
    warnings.push(`Missing required analogy/example for ${mode} mode`);
  }
  
  // Check for required fact
  const foundFact = hasFact(response);
  if (policy.requiresFact && !foundFact) {
    warnings.push(`Missing interesting fact for ${mode} mode`);
  }
  
  // Log warnings
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(`[ModeState] Warning: ${w}`));
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    questionCount,
    wordCount,
    hasAnalogy: foundAnalogy,
    hasFact: foundFact,
  };
}

/**
 * Parse detected intent from LLM response
 */
export function parseIntentFromResponse(response: string): UserIntent | null {
  const intentMatch = response.match(/\[INTENT:\s*(\w+)\]/i);
  if (intentMatch && intentMatch[1]) {
    const rawIntent = intentMatch[1].toLowerCase();
    
    // Map to valid intent types
    const validIntents: UserIntent[] = [
      'question_factual', 'question_why', 'question_how',
      'statement_sharing', 'statement_opinion', 'statement_explaining',
      'confusion', 'boredom', 'request_story', 'request_joke',
      'request_activity', 'request_parent',
      'unclear', 'unsafe', 'greeting', 'silence', 'unknown',
    ];
    
    if (validIntents.includes(rawIntent as UserIntent)) {
      return rawIntent as UserIntent;
    }
  }
  return null;
}

/**
 * Strip intent tag from response for display
 */
export function stripIntentTag(response: string): string {
  return response.replace(/\n?\[INTENT:\s*\w+\]/gi, '').trim();
}

/**
 * Log mode interaction for debugging
 */
export function logModeInteraction(
  turnCount: number,
  preClassIntent: UserIntent,
  selectedMode: ResponseMode,
  detectedIntent: UserIntent | null,
  validation: ValidationResult
): void {
  console.log(
    `[ModeState] Turn ${turnCount} | Pre-class: ${preClassIntent} | Selected: ${selectedMode} | Detected: ${detectedIntent || 'none'}`
  );
  
  if (validation.warnings.length > 0) {
    console.log(`[ModeState] Validation: ${validation.warnings.length} warning(s)`);
  } else {
    console.log(`[ModeState] Validation: OK (${validation.wordCount} words, ${validation.questionCount} questions)`);
  }
}

/**
 * Log current mode state
 */
export function logModeState(
  currentMode: ResponseMode,
  lastModes: ResponseMode[],
  questionStreak: number,
  confusionStreak: number,
  engagementStreak: number
): void {
  console.log(
    `[ModeState] State: { current: ${currentMode}, lastModes: [${lastModes.slice(0, 3).join(', ')}], qStreak: ${questionStreak}, confStreak: ${confusionStreak}, engStreak: ${engagementStreak} }`
  );
}

