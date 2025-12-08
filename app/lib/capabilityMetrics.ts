/**
 * Capability Detection and Metrics
 * Analyzes user messages to determine skill level and capability
 */

export interface CapabilityMetrics {
  // Response characteristics
  avgResponseLength: number;        // Average words per user message
  maxResponseLength: number;         // Longest user message
  vocabularySophistication: number; // 0-100, based on complex word usage
  sentenceComplexity: number;      // 0-100, based on sentence structure
  
  // Engagement patterns
  questionDepth: number;            // 0-100, abstract vs concrete questions
  topicComplexity: number;         // 0-100, complexity of topics discussed
  engagementFrequency: number;     // Messages per session
  
  // Confusion signals
  confusionCount: number;           // "I don't understand", "what?", etc.
  repetitionRequests: number;       // "Can you say that again?"
  simplificationRequests: number;   // "Can you explain simpler?"
  
  // Positive signals
  advancedQuestions: number;        // Count of abstract/deep questions
  vocabularyUsage: number;          // Count of sophisticated words used
  extendedResponses: number;        // Count of longer responses (>threshold)
}

export interface CapabilityScore {
  overall: number;                  // 0-100, weighted average
  language: number;                 // 0-100, language capability
  reasoning: number;                // 0-100, reasoning capability
  engagement: number;               // 0-100, engagement level
  confidence: number;               // 0-100, confidence in assessment
}

// Vocabulary complexity word lists (age-appropriate)
const SIMPLE_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'go', 'went', 'come', 'came', 'see', 'saw', 'get', 'got', 'make', 'made', 'take', 'took',
  'big', 'small', 'good', 'bad', 'happy', 'sad', 'yes', 'no', 'what', 'where', 'when', 'who'
]);

const MODERATE_WORDS = new Set([
  'because', 'although', 'however', 'therefore', 'although', 'while', 'during', 'through',
  'understand', 'explain', 'describe', 'compare', 'different', 'similar', 'important',
  'interesting', 'wonder', 'think', 'believe', 'maybe', 'perhaps', 'probably',
  'happen', 'change', 'cause', 'effect', 'result', 'reason', 'example'
]);

const COMPLEX_WORDS = new Set([
  'analyze', 'evaluate', 'hypothesize', 'theorize', 'conclude', 'determine', 'investigate',
  'evidence', 'perspective', 'concept', 'principle', 'theory', 'hypothesis', 'methodology',
  'significant', 'substantial', 'considerable', 'complex', 'sophisticated', 'comprehensive',
  'nevertheless', 'furthermore', 'consequently', 'alternatively', 'specifically'
]);

// Confusion signal patterns
const CONFUSION_PATTERNS = [
  /i don'?t understand/i,
  /i don'?t know/i,
  /what\?/i,
  /huh\?/i,
  /confused/i,
  /don'?t get it/i,
  /not sure/i,
  /what do you mean/i,
  /i'm lost/i,
];

// Repetition request patterns
const REPETITION_PATTERNS = [
  /can you say that again/i,
  /repeat/i,
  /what did you say/i,
  /say again/i,
  /one more time/i,
];

// Simplification request patterns
const SIMPLIFICATION_PATTERNS = [
  /can you explain simpler/i,
  /easier/i,
  /too hard/i,
  /too difficult/i,
  /simpler/i,
  /simple words/i,
];

// Advanced question patterns (abstract/deep thinking)
const ADVANCED_QUESTION_PATTERNS = [
  /why does/i,
  /how does/i,
  /what if/i,
  /what would happen if/i,
  /how might/i,
  /what are the/i,
  /explain why/i,
  /what causes/i,
  /how can/i,
];

// Hypothesis formation patterns
const HYPOTHESIS_PATTERNS = [
  /maybe/i,
  /i think/i,
  /could it be/i,
  /perhaps/i,
  /probably/i,
  /might be/i,
  /possibly/i,
];

/**
 * Counts words in a message
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Estimates vocabulary sophistication (0-100)
 */
function estimateVocabularyLevel(message: string): number {
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;

  let simpleCount = 0;
  let moderateCount = 0;
  let complexCount = 0;

  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, '');
    if (COMPLEX_WORDS.has(cleanWord)) {
      complexCount++;
    } else if (MODERATE_WORDS.has(cleanWord)) {
      moderateCount++;
    } else if (SIMPLE_WORDS.has(cleanWord)) {
      simpleCount++;
    }
  }

  const total = words.length;
  if (total === 0) return 0;

  // Weight: simple = 0-30, moderate = 30-70, complex = 70-100
  const score = (simpleCount * 15 + moderateCount * 50 + complexCount * 85) / total;
  return Math.min(100, Math.max(0, score));
}

/**
 * Estimates sentence complexity (0-100)
 */
function estimateSentenceComplexity(message: string): number {
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 0;

  let totalComplexity = 0;
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).length;
    const hasComma = sentence.includes(',');
    const hasConjunction = /and|or|but|because|although|while|if|when/i.test(sentence);
    const hasSubordinate = /because|although|while|if|when|since|until/i.test(sentence);

    let complexity = 0;
    if (words > 15) complexity += 30;
    else if (words > 10) complexity += 20;
    else if (words > 5) complexity += 10;

    if (hasSubordinate) complexity += 30;
    else if (hasConjunction) complexity += 20;
    else if (hasComma) complexity += 10;

    totalComplexity += Math.min(100, complexity);
  }

  return totalComplexity / sentences.length;
}

/**
 * Detects confusion signals in a message
 */
export function detectConfusionSignals(message: string): boolean {
  return CONFUSION_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Detects repetition requests
 */
export function detectRepetitionRequests(message: string): boolean {
  return REPETITION_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Detects simplification requests
 */
export function detectSimplificationRequests(message: string): boolean {
  return SIMPLIFICATION_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Detects advanced question patterns
 */
export function detectAdvancedQuestions(message: string): boolean {
  return ADVANCED_QUESTION_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Detects hypothesis formation
 */
export function detectHypothesisFormation(message: string): boolean {
  return HYPOTHESIS_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Estimates question depth (0-100)
 * Higher = more abstract, lower = more concrete
 * Works for voice input (no question marks required)
 */
function estimateQuestionDepth(message: string): number {
  // Detect questions by patterns, not just question marks (voice input often lacks punctuation)
  const isQuestion = 
    // Question words at start
    /^(why|how|what|where|when|who|which|whose|whom|can|could|would|should|will|do|does|did|is|are|was|were|may|might)/i.test(message.trim()) ||
    // Question patterns anywhere
    /(why|how|what if|what would|what are|what is|what was|what do|what does|what did|can you|could you|would you|should we|will it|is it|are they|was it|were they)/i.test(message) ||
    // Rising intonation indicators (common in voice)
    message.trim().endsWith('?') ||
    // Very short messages that start with question words are likely questions
    (message.trim().split(/\s+/).length <= 5 && /^(why|how|what|where|when|who)/i.test(message.trim()));

  if (!isQuestion) {
    console.log(`[QuestionDepth] Not a question: "${message}" → depth: 0`);
    return 0;
  }

  let depth = 0;
  const hasAdvanced = detectAdvancedQuestions(message);
  const hasHypothesis = detectHypothesisFormation(message);
  const hasAbstractWords = /why|how|what if|what would/i.test(message);
  const hasBasicWords = /what|where|when|who/i.test(message);

  if (hasAdvanced) depth += 50;
  if (hasHypothesis) depth += 30;
  if (hasAbstractWords) depth += 20;
  if (hasBasicWords) depth += 10;

  const finalDepth = Math.min(100, depth);
  console.log(`[QuestionDepth] "${message}" → depth: ${finalDepth} (advanced: ${hasAdvanced}, hypothesis: ${hasHypothesis}, abstract: ${hasAbstractWords}, basic: ${hasBasicWords})`);
  return finalDepth;
}

/**
 * Analyzes a single user message and extracts capability metrics
 */
export function analyzeUserMessage(message: string): Partial<CapabilityMetrics> {
  const wordCount = countWords(message);
  const vocabLevel = estimateVocabularyLevel(message);
  const sentenceComplexity = estimateSentenceComplexity(message);
  const questionDepth = estimateQuestionDepth(message);

  return {
    avgResponseLength: wordCount,
    maxResponseLength: wordCount,
    vocabularySophistication: vocabLevel,
    sentenceComplexity: sentenceComplexity,
    questionDepth: questionDepth,
    confusionCount: detectConfusionSignals(message) ? 1 : 0,
    repetitionRequests: detectRepetitionRequests(message) ? 1 : 0,
    simplificationRequests: detectSimplificationRequests(message) ? 1 : 0,
    advancedQuestions: detectAdvancedQuestions(message) ? 1 : 0,
    vocabularyUsage: vocabLevel > 50 ? 1 : 0,
    extendedResponses: wordCount > 15 ? 1 : 0,
  };
}

/**
 * Aggregates multiple capability metrics into a single metric
 */
export function aggregateMetrics(metricsArray: Partial<CapabilityMetrics>[]): CapabilityMetrics {
  if (metricsArray.length === 0) {
    return {
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
    };
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => arr.length > 0 ? sum(arr) / arr.length : 0;

  return {
    avgResponseLength: avg(metricsArray.map(m => m.avgResponseLength || 0)),
    maxResponseLength: Math.max(...metricsArray.map(m => m.maxResponseLength || 0)),
    vocabularySophistication: avg(metricsArray.map(m => m.vocabularySophistication || 0)),
    sentenceComplexity: avg(metricsArray.map(m => m.sentenceComplexity || 0)),
    questionDepth: avg(metricsArray.map(m => m.questionDepth || 0)),
    topicComplexity: avg(metricsArray.map(m => m.topicComplexity || 0)), // Placeholder
    engagementFrequency: metricsArray.length,
    confusionCount: sum(metricsArray.map(m => m.confusionCount || 0)),
    repetitionRequests: sum(metricsArray.map(m => m.repetitionRequests || 0)),
    simplificationRequests: sum(metricsArray.map(m => m.simplificationRequests || 0)),
    advancedQuestions: sum(metricsArray.map(m => m.advancedQuestions || 0)),
    vocabularyUsage: sum(metricsArray.map(m => m.vocabularyUsage || 0)),
    extendedResponses: sum(metricsArray.map(m => m.extendedResponses || 0)),
  };
}

/**
 * Calculates capability score from metrics
 */
export function calculateCapabilityScore(
  metrics: CapabilityMetrics,
  recentMessages: number
): CapabilityScore {
  if (recentMessages < 3) {
    // Not enough data for reliable assessment
    return {
      overall: 50,
      language: 50,
      reasoning: 50,
      engagement: 50,
      confidence: 0,
    };
  }

  // Language capability (vocabulary + sentence complexity)
  const languageScore = (metrics.vocabularySophistication * 0.6 + metrics.sentenceComplexity * 0.4);

  // Reasoning capability (question depth + advanced questions - confusion)
  const confusionPenalty = Math.min(30, (metrics.confusionCount + metrics.repetitionRequests + metrics.simplificationRequests) * 10);
  const questionDepthComponent = metrics.questionDepth * 0.7;
  const advancedQuestionsComponent = (metrics.advancedQuestions / recentMessages) * 30;
  const reasoningScore = Math.max(0, questionDepthComponent + advancedQuestionsComponent - confusionPenalty);
  
  console.log(`[CapabilityScore] Reasoning calculation: questionDepth=${metrics.questionDepth}, questionDepthComponent=${questionDepthComponent.toFixed(2)}, advancedQuestions=${metrics.advancedQuestions}, advancedComponent=${advancedQuestionsComponent.toFixed(2)}, confusionPenalty=${confusionPenalty}, reasoningScore=${reasoningScore.toFixed(2)}`);

  // Engagement (response length + frequency)
  const avgLengthScore = Math.min(100, (metrics.avgResponseLength / 20) * 100);
  const engagementScore = (avgLengthScore * 0.6 + Math.min(100, (metrics.engagementFrequency / 10) * 100) * 0.4);

  // Overall score (weighted average)
  const overall = (languageScore * 0.4 + reasoningScore * 0.4 + engagementScore * 0.2);

  // Confidence increases with more messages and less confusion
  const confusionRate = (metrics.confusionCount + metrics.repetitionRequests + metrics.simplificationRequests) / recentMessages;
  const confidence = Math.min(100, Math.max(0, (recentMessages / 15) * 70 + (1 - confusionRate) * 30));

  return {
    overall: Math.round(Math.max(0, Math.min(100, overall))),
    language: Math.round(Math.max(0, Math.min(100, languageScore))),
    reasoning: Math.round(Math.max(0, Math.min(100, reasoningScore))),
    engagement: Math.round(Math.max(0, Math.min(100, engagementScore))),
    confidence: Math.round(confidence),
  };
}

/**
 * Analyzes recent conversation messages
 */
export function analyzeRecentConversation(
  messages: Array<{ role: string; content: string }>,
  windowSize: number = 15
): CapabilityMetrics {
  // Filter to only user messages
  const userMessages = messages
    .filter(msg => msg.role === 'user')
    .slice(-windowSize)
    .map(msg => msg.content);

  if (userMessages.length === 0) {
    return aggregateMetrics([]);
  }

  // Analyze each message
  const metricsArray = userMessages.map(msg => analyzeUserMessage(msg));

  // Aggregate with exponential decay (recent messages weighted more)
  const weights: number[] = [];
  for (let i = 0; i < metricsArray.length; i++) {
    const position = i / metricsArray.length; // 0 to 1
    weights.push(Math.exp(position * 2) / Math.exp(2)); // Exponential weight
  }

  // Weighted aggregation
  const weightedMetrics = metricsArray.map((m, i) => {
    const weight = weights[i];
    return {
      avgResponseLength: (m.avgResponseLength || 0) * weight,
      maxResponseLength: (m.maxResponseLength || 0) * weight,
      vocabularySophistication: (m.vocabularySophistication || 0) * weight,
      sentenceComplexity: (m.sentenceComplexity || 0) * weight,
      questionDepth: (m.questionDepth || 0) * weight,
      topicComplexity: (m.topicComplexity || 0) * weight,
      engagementFrequency: 1 * weight,
      confusionCount: (m.confusionCount || 0) * weight,
      repetitionRequests: (m.repetitionRequests || 0) * weight,
      simplificationRequests: (m.simplificationRequests || 0) * weight,
      advancedQuestions: (m.advancedQuestions || 0) * weight,
      vocabularyUsage: (m.vocabularyUsage || 0) * weight,
      extendedResponses: (m.extendedResponses || 0) * weight,
    };
  });

  return aggregateMetrics(weightedMetrics);
}

/**
 * Calculates trend from historical metrics
 */
export function calculateTrend(
  historicalMetrics: CapabilityMetrics[]
): 'improving' | 'stable' | 'declining' {
  if (historicalMetrics.length < 2) return 'stable';

  const recent = historicalMetrics.slice(-5);
  const older = historicalMetrics.slice(0, -5);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, m) => sum + m.vocabularySophistication + m.questionDepth, 0) / recent.length;
  const olderAvg = older.reduce((sum, m) => sum + m.vocabularySophistication + m.questionDepth, 0) / older.length;

  const diff = recentAvg - olderAvg;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

