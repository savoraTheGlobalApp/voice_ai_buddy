/**
 * Response Mode Types and Policies
 * Defines the state machine modes for adaptive tutoring responses
 */

/**
 * Response modes for the tutoring state machine
 */
export type ResponseMode = 
  | 'probe'      // Deep thinking questions, hypothesis formation
  | 'hint'       // One hint + one guiding question
  | 'explain'    // Clear explanation with concrete example
  | 'encourage'  // Celebrate effort, build confidence
  | 'simplify'   // Simpler language, concrete examples, fewer questions
  | 'engage'     // Re-engage with humor, story, or interesting fact
  | 'redirect'   // Gently redirect unsafe/off-topic content
  | 'clarify'    // Ask for clarification on unclear input
  | 'teach'      // Inverse tutoring - let child teach the AI
  | 'social';    // Encourage physical activities, hands-on experiments, and parent engagement

/**
 * User intent types detected from input
 */
export type UserIntent = 
  | 'question_factual'    // "What is X?"
  | 'question_why'        // "Why does X?"
  | 'question_how'        // "How does X work?"
  | 'statement_sharing'   // Child shares something
  | 'statement_opinion'   // Child expresses opinion
  | 'statement_explaining'// Child is explaining something (for teach mode)
  | 'confusion'           // "I don't understand"
  | 'boredom'             // "Boring", "Not interesting"
  | 'request_story'       // "Tell me a story"
  | 'request_joke'        // "Tell me a joke"
  | 'request_activity'    // "I want to move", "Let's do something"
  | 'request_parent'      // "Can I ask my mom?", "I want to tell my dad"
  | 'unclear'             // Can't understand
  | 'unsafe'              // Unsafe content detected
  | 'greeting'            // "Hi", "Hello"
  | 'silence'             // No response / very short
  | 'unknown';            // Default fallback

/**
 * Tone modifiers for different modes
 */
export type ToneModifier = 'warm' | 'enthusiastic' | 'calm' | 'playful' | 'curious';

/**
 * Policy constraints for each response mode
 */
export interface ModePolicy {
  mode: ResponseMode;
  maxQuestions: 0 | 1 | 2;
  requiresAnalogy: boolean;
  requiresFact: boolean;
  allowHumor: boolean;
  toneModifier: ToneModifier;
  wordBudgetMultiplier: number; // 0.5 = shorter, 1.5 = longer relative to age config
  description: string;
}

/**
 * Mode policies defining constraints for each response mode
 */
export const MODE_POLICIES: Record<ResponseMode, ModePolicy> = {
  probe: {
    mode: 'probe',
    maxQuestions: 1,
    requiresAnalogy: false,
    requiresFact: false,
    allowHumor: false,
    toneModifier: 'warm',
    wordBudgetMultiplier: 1.0,
    description: 'Guide deeper thinking with thoughtful questions',
  },
  hint: {
    mode: 'hint',
    maxQuestions: 1,
    requiresAnalogy: true,
    requiresFact: false,
    allowHumor: false,
    toneModifier: 'warm',
    wordBudgetMultiplier: 0.8,
    description: 'Provide one helpful hint with a guiding question',
  },
  explain: {
    mode: 'explain',
    maxQuestions: 1, // optional check question
    requiresAnalogy: true,
    requiresFact: true,
    allowHumor: false,
    toneModifier: 'warm',
    wordBudgetMultiplier: 1.2,
    description: 'Provide clear explanation with concrete example',
  },
  encourage: {
    mode: 'encourage',
    maxQuestions: 1, // optional
    requiresAnalogy: false,
    requiresFact: false,
    allowHumor: true,
    toneModifier: 'enthusiastic',
    wordBudgetMultiplier: 0.7,
    description: 'Celebrate effort and build confidence',
  },
  simplify: {
    mode: 'simplify',
    maxQuestions: 1, // very simple
    requiresAnalogy: true,
    requiresFact: false,
    allowHumor: false,
    toneModifier: 'calm',
    wordBudgetMultiplier: 0.6,
    description: 'Use simpler language and concrete examples',
  },
  engage: {
    mode: 'engage',
    maxQuestions: 1, // playful
    requiresAnalogy: false,
    requiresFact: true, // interesting fact
    allowHumor: true,
    toneModifier: 'playful',
    wordBudgetMultiplier: 1.0,
    description: 'Re-engage with humor, story, or interesting fact',
  },
  redirect: {
    mode: 'redirect',
    maxQuestions: 0,
    requiresAnalogy: false,
    requiresFact: false,
    allowHumor: false,
    toneModifier: 'calm',
    wordBudgetMultiplier: 0.5,
    description: 'Gently redirect unsafe or off-topic content',
  },
  clarify: {
    mode: 'clarify',
    maxQuestions: 1,
    requiresAnalogy: false,
    requiresFact: false,
    allowHumor: false,
    toneModifier: 'warm',
    wordBudgetMultiplier: 0.5,
    description: 'Ask for clarification on unclear input',
  },
  teach: {
    mode: 'teach',
    maxQuestions: 1, // clarifying questions as "confused student"
    requiresAnalogy: false,
    requiresFact: false,
    allowHumor: true,
    toneModifier: 'curious',
    wordBudgetMultiplier: 0.6, // short responses to let child talk more
    description: 'Inverse tutoring - let child teach the AI',
  },
  social: {
    mode: 'social',
    maxQuestions: 1, // optional follow-up
    requiresAnalogy: false,
    requiresFact: false,
    allowHumor: true,
    toneModifier: 'enthusiastic',
    wordBudgetMultiplier: 0.8,
    description: 'Encourage physical activities, hands-on experiments, and parent engagement',
  },
};

/**
 * In-memory mode state for tracking conversation flow
 * Not persisted to Firestore - resets each session
 */
export interface ModeState {
  currentMode: ResponseMode;
  lastModes: ResponseMode[];      // Last 5 modes used (for variety)
  questionStreak: number;         // Consecutive turns with questions asked
  confusionStreak: number;        // Consecutive confusion signals from child
  engagementStreak: number;       // Consecutive engaged responses from child
  turnCount: number;              // Total turns in session
  modeUsage: Record<ResponseMode, number>; // Count of each mode used (for diversity tracking)
  previousLLMIntent: UserIntent | null;  // LLM's intent analysis from previous turn
  previousLLMConfidence: number;         // Confidence of previous LLM intent (0-100)
}

/**
 * Result of light pre-classification
 */
export interface PreClassification {
  intent: UserIntent;
  confidence: number;             // 0-100
  signals: {
    confusion: boolean;
    boredom: boolean;
    effort: boolean;              // Child showing effort
    engagement: boolean;          // Long, thoughtful response
    explaining: boolean;          // Child is trying to explain
  };
}

/**
 * Get the policy for a given response mode
 */
export function getModePolicy(mode: ResponseMode): ModePolicy {
  return MODE_POLICIES[mode];
}

/**
 * Get all available response modes
 */
export function getAllModes(): ResponseMode[] {
  return Object.keys(MODE_POLICIES) as ResponseMode[];
}

