/**
 * Mode Selector - State Machine for Response Mode Selection
 * Implements light pre-classification and mode selection logic
 */

import { 
  ResponseMode, 
  UserIntent, 
  ModeState, 
  PreClassification,
  MODE_POLICIES 
} from './responseMode';
import { SubAgeLevel, getAgeGroupFromSubLevel, AgeGroup } from './ageGroups';
import { getModeConfig, ModeSelectionConfig } from './modeConfig';

// Confusion patterns
const CONFUSION_PATTERNS = [
  /too (complicated|hard|difficult)/i,
  /don'?t (understand|get it|know)/i,
  /what do you mean/i,
  /confused/i,
  /i'?m confused/i,
  /huh\??/i,
  /i'?m lost/i,
  /can you (explain|say) (that |it )?(again|simply)/i,
  /i (don'?t|do not) (get|understand)/i,
  /(makes?|doesn'?t make) no sense/i,
  /doesn'?t make sense/i,
  /(it|this|that) (doesn'?t|don'?t) make sense/i,
];

// Boredom patterns
const BOREDOM_PATTERNS = [
  /boring/i,
  /not interesting/i,
  /don'?t care/i,
  /whatever/i,
  /so\?$/i,
  /who cares/i,
  /this is (dumb|stupid|lame)/i,
  /too easy/i,
  /too simple/i,
  /(it'?s|this is|that'?s) too easy/i,
];

// Question patterns
const WHY_PATTERNS = [/^why\b/i, /\bwhy\b.*\?$/i, /how come/i];
const HOW_PATTERNS = [/^how (do|does|can|could|would|is|are)/i, /\bhow\b.*\?$/i];
const WHAT_PATTERNS = [/^(what|where|when|who|which)/i, /\b(what|where|when|who|which)\b.*\?$/i];

// Explaining patterns (child is teaching)
const EXPLAINING_PATTERNS = [
  /so basically/i,
  /let me (tell|explain|show)/i,
  /i (think|know) it('s| is) because/i,
  /the reason is/i,
  /what happens is/i,
  /i learned that/i,
  /i know (how|why|what)/i,
  /because .{10,}/i, // Longer "because" explanations
];

// Effort patterns (child showing effort)
// Note: "I think" alone is too common, require context
const EFFORT_PATTERNS = [
  /i think (it'?s|that|this|maybe|probably|because)/i,  // More specific
  /maybe/i,
  /i guess/i,
  /probably/i,
  /could it be/i,
  /is it (because|that)/i,
  /i wonder/i,
  /(i think|maybe|probably) .{5,}/i,  // "I think" with at least 5 more chars
];

// Entertainment request patterns
const STORY_PATTERNS = [/tell (me )?(a )?story/i, /story please/i, /can you tell/i];
const JOKE_PATTERNS = [/tell (me )?(a )?joke/i, /joke please/i, /something funny/i];

// Activity request patterns
const ACTIVITY_PATTERNS = [
  /(want|need|let'?s) (to )?(move|play|do something|exercise|dance|jump)/i,
  /i'?m (tired|bored|sitting|stuck)/i,
  /can we (play|move|do)/i,
  /(let'?s|we should) (get up|stand|move around)/i,
];

// Parent engagement patterns
const PARENT_PATTERNS = [
  /(ask|tell|show) (my )?(mom|dad|parent|mother|father)/i,
  /(can|should) i (ask|tell|show) (my )?(mom|dad|parent)/i,
  /(want|need) to (ask|tell|show) (my )?(mom|dad|parent)/i,
];

// Greeting patterns
const GREETING_PATTERNS = [/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)\b/i];

// Unsafe content patterns (expanded with word boundaries)
const UNSAFE_PATTERNS = [
  // Violence
  /\b(kill|killing|killed|die|dying|died|dead|death|murder|murdered|blood|bloody|violence|violent|hurt|hurting|hit|hitting|fight|fighting|war|weapon|weapons|gun|guns|bomb|bombs|knife|knives)\b/i,
  // Sexual content
  /\b(sex|sexual|naked|nude|porn|pornography|rape|raped)\b/i,
  // Substance abuse
  /\b(drug|drugs|alcohol|drunk|drinking|beer|wine|smoke|smoking|cigarette|cigarettes)\b/i,
  // Self-harm
  /\b(suicide|kill myself|hurt myself|cut myself|self harm)\b/i,
  // Bullying/threats
  /\b(threat|threaten|threatening|bully|bullying|hate|hateful)\b/i,
];

/**
 * Combined intent analysis: Rule-based + LLM-derived intent from previous turn
 * Uses previous LLM intent to improve accuracy for ambiguous cases
 */
export function combinedPreClassify(
  userMessage: string,
  previousLLMIntent: UserIntent | null,
  previousLLMConfidence: number,
  modeState: ModeState
): PreClassification {
  const config = getModeConfig();
  
  // Step 1: Rule-based classification (fast, always runs)
  const ruleBased = lightPreClassify(userMessage);
  
  // Step 2: Apply LLM intent decay (older intents lose weight)
  let adjustedLLMConfidence = previousLLMConfidence;
  if (previousLLMIntent && modeState.turnCount > 0) {
    // Decay confidence based on how many turns ago it was
    // If it's from previous turn (turnCount difference = 1), no decay
    // For older intents, apply decay
    const turnsSinceIntent = 1; // Currently we only store previous turn
    adjustedLLMConfidence = previousLLMConfidence * Math.pow(config.llmIntentDecayRate, turnsSinceIntent);
  }
  
  // Step 3: If we have previous LLM intent with good confidence, combine it
  if (previousLLMIntent && adjustedLLMConfidence > config.llmIntentMinConfidence) {
    return combineIntents(ruleBased, previousLLMIntent, adjustedLLMConfidence, modeState, config);
  }
  
  return ruleBased;
}

/**
 * Combine rule-based and LLM-derived intents
 * Uses weighted combination based on confidence levels
 */
function combineIntents(
  ruleBased: PreClassification,
  llmIntent: UserIntent,
  llmConfidence: number,
  modeState: ModeState,
  config: ModeSelectionConfig
): PreClassification {
  // Weight factors: rule-based gets more weight for high-confidence cases
  const ruleWeight = ruleBased.confidence > 80 ? 0.7 : 0.6;
  const llmWeight = 1 - ruleWeight;
  
  // For critical signals (confusion, boredom), require higher combined confidence
  const isCriticalSignal = llmIntent === 'confusion' || llmIntent === 'boredom' ||
                          ruleBased.intent === 'confusion' || ruleBased.intent === 'boredom';
  
  // If intents match, boost confidence
  if (ruleBased.intent === llmIntent) {
    const combinedConfidence = Math.min(100, Math.round(
      ruleBased.confidence + (llmConfidence * llmWeight)
    ));
    
    // For critical signals, ensure minimum confidence
    const finalConfidence = isCriticalSignal 
      ? Math.max(combinedConfidence, config.criticalSignalMinConfidence)
      : combinedConfidence;
    
    return {
      ...ruleBased,
      confidence: finalConfidence,
      // Combine signals (OR logic for most, but require higher confidence for critical)
      signals: {
        confusion: ruleBased.signals.confusion || (llmIntent === 'confusion' && llmConfidence >= config.criticalSignalMinConfidence),
        boredom: ruleBased.signals.boredom || (llmIntent === 'boredom' && llmConfidence >= config.criticalSignalMinConfidence),
        effort: ruleBased.signals.effort || (llmIntent === 'statement_opinion'),
        engagement: ruleBased.signals.engagement || 
                   (llmIntent === 'statement_explaining' || llmIntent.startsWith('question_')),
        explaining: ruleBased.signals.explaining || (llmIntent === 'statement_explaining'),
      }
    };
  }
  
  // If intents differ, use weighted decision
  // Prefer LLM if it has high confidence and rule-based is low
  if (llmConfidence > 75 && ruleBased.confidence < 70) {
    const combinedConfidence = Math.round((ruleBased.confidence * ruleWeight) + (llmConfidence * llmWeight));
    const finalConfidence = isCriticalSignal
      ? Math.max(combinedConfidence, config.criticalSignalMinConfidence)
      : combinedConfidence;
    
    return {
      intent: llmIntent,
      confidence: finalConfidence,
      signals: {
        confusion: (llmIntent === 'confusion' && llmConfidence >= config.criticalSignalMinConfidence) || ruleBased.signals.confusion,
        boredom: (llmIntent === 'boredom' && llmConfidence >= config.criticalSignalMinConfidence) || ruleBased.signals.boredom,
        effort: llmIntent === 'statement_opinion' || ruleBased.signals.effort,
        engagement: llmIntent === 'statement_explaining' || 
                   llmIntent.startsWith('question_') || 
                   ruleBased.signals.engagement,
        explaining: llmIntent === 'statement_explaining' || ruleBased.signals.explaining,
      }
    };
  }
  
  // Default: prefer rule-based but incorporate LLM signals
  const combinedConfidence = Math.round((ruleBased.confidence * ruleWeight) + (llmConfidence * llmWeight));
  const finalConfidence = isCriticalSignal
    ? Math.max(combinedConfidence, config.criticalSignalMinConfidence)
    : combinedConfidence;
  
  return {
    ...ruleBased,
    confidence: finalConfidence,
    signals: {
      confusion: ruleBased.signals.confusion || (llmIntent === 'confusion' && llmConfidence >= config.criticalSignalMinConfidence),
      boredom: ruleBased.signals.boredom || (llmIntent === 'boredom' && llmConfidence >= config.criticalSignalMinConfidence),
      effort: ruleBased.signals.effort || (llmIntent === 'statement_opinion'),
      engagement: ruleBased.signals.engagement || 
                 (llmIntent === 'statement_explaining' || llmIntent.startsWith('question_')),
      explaining: ruleBased.signals.explaining || (llmIntent === 'statement_explaining'),
    }
  };
}

/**
 * Light pre-classification of user message
 * Fast pattern-based detection for obvious cases
 */
export function lightPreClassify(userMessage: string): PreClassification {
  const msg = userMessage.trim();
  const lowerMsg = msg.toLowerCase();
  
  // Default result
  const result: PreClassification = {
    intent: 'unknown',
    confidence: 50,
    signals: {
      confusion: false,
      boredom: false,
      effort: false,
      engagement: false,
      explaining: false,
    },
  };
  
  // Empty or very short message
  if (msg.length < 3) {
    result.intent = 'silence';
    result.confidence = 90;
    return result;
  }
  
  // Check for unsafe content first (with word boundary awareness)
  const config = getModeConfig();
  const hasUnsafeContent = config.unsafePatternWordBoundary
    ? UNSAFE_PATTERNS.some(p => {
        // For word boundary patterns, check if match is at word boundary
        const match = msg.match(p);
        if (!match) return false;
        const matchIndex = match.index || 0;
        const beforeChar = matchIndex > 0 ? msg[matchIndex - 1] : ' ';
        const afterIndex = matchIndex + match[0].length;
        const afterChar = afterIndex < msg.length ? msg[afterIndex] : ' ';
        // Check if surrounded by word boundaries (non-alphanumeric)
        return !/\w/.test(beforeChar) && !/\w/.test(afterChar);
      })
    : UNSAFE_PATTERNS.some(p => p.test(msg));
  
  if (hasUnsafeContent) {
    result.intent = 'unsafe';
    result.confidence = 80;
    return result;
  }
  
  // Check signals
  result.signals.confusion = CONFUSION_PATTERNS.some(p => p.test(msg));
  result.signals.boredom = BOREDOM_PATTERNS.some(p => p.test(msg));
  result.signals.effort = EFFORT_PATTERNS.some(p => p.test(msg));
  result.signals.explaining = EXPLAINING_PATTERNS.some(p => p.test(msg));
  // Better engagement detection: length + quality indicators
  const hasLength = msg.length >= config.engagementMinLength || msg.split(/\s+/).length >= config.engagementMinWords;
  const hasQualityIndicators = 
    /\b(because|so|but|and|then|when|if|why|how|what if)\b/i.test(msg) ||  // Connectors
    /\?/.test(msg) ||  // Questions show engagement
    /(i think|maybe|probably|i guess|i wonder)/i.test(msg);  // Thinking words
  
  result.signals.engagement = hasLength && (hasQualityIndicators || msg.split(/\s+/).length >= config.engagementMinWords + 3);
  
  // Priority-based intent detection
  if (result.signals.confusion) {
    result.intent = 'confusion';
    result.confidence = 85;
    return result;
  }
  
  if (result.signals.boredom) {
    result.intent = 'boredom';
    result.confidence = 80;
    return result;
  }
  
  if (result.signals.explaining) {
    result.intent = 'statement_explaining';
    result.confidence = 75;
    return result;
  }
  
  // Check for greetings
  if (GREETING_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'greeting';
    result.confidence = 90;
    return result;
  }
  
  // Check for entertainment requests
  if (STORY_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'request_story';
    result.confidence = 85;
    return result;
  }
  
  if (JOKE_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'request_joke';
    result.confidence = 85;
    return result;
  }
  
  // Check for activity requests
  if (ACTIVITY_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'request_activity';
    result.confidence = 80;
    return result;
  }
  
  // Check for parent engagement requests
  if (PARENT_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'request_parent';
    result.confidence = 80;
    return result;
  }
  
  // Check for questions
  if (WHY_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'question_why';
    result.confidence = 80;
    return result;
  }
  
  if (HOW_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'question_how';
    result.confidence = 80;
    return result;
  }
  
  // More precise question detection
  const hasQuestionWord = WHAT_PATTERNS.some(p => p.test(msg));
  const hasQuestionMark = msg.includes('?');
  const isQuestionPattern = /^(what|where|when|who|which|how|why|can|could|would|should|is|are|do|does|did|will|was|were)\b/i.test(msg.trim());
  
  if (hasQuestionWord || (hasQuestionMark && isQuestionPattern)) {
    result.intent = 'question_factual';
    result.confidence = hasQuestionWord ? 80 : 70;  // Higher confidence if question word present
    return result;
  }
  
  // Default to statement
  if (result.signals.effort) {
    result.intent = 'statement_opinion';
    result.confidence = 60;
  } else {
    result.intent = 'statement_sharing';
    result.confidence = 50;
  }
  
  return result;
}

/**
 * Mode selection state machine with reasoning
 * Returns both the selected mode and the reasoning behind it
 */
export function selectModeWithReasoning(
  preClass: PreClassification,
  modeState: ModeState,
  effectiveLevel: SubAgeLevel
): { mode: ResponseMode; reason: ModeSelectionReason } {
  const { intent, signals } = preClass;
  const ageGroup = getAgeGroupFromSubLevel(effectiveLevel);
  const lastMode = modeState.lastModes[0];
  const config = getModeConfig();
  const reason: ModeSelectionReason = {
    primaryReason: '',
    intentSource: modeState.previousLLMIntent ? 'combined' : 'rule-based',
    thresholdsUsed: {},
  };
  
  // Priority 1: Safety redirect
  if (intent === 'unsafe') {
    reason.primaryReason = 'Safety: unsafe content detected';
    return { mode: 'redirect', reason };
  }
  
  // Priority 2: Confusion handling (age-based threshold)
  if (signals.confusion || intent === 'confusion') {
    const confusionThreshold = config.confusionThresholds[ageGroup];
    reason.thresholdsUsed!.confusion = confusionThreshold;
    // If already confused for threshold turns, explain instead of more questions
    if (modeState.confusionStreak >= confusionThreshold) {
      reason.primaryReason = `Confusion: streak ${modeState.confusionStreak} >= threshold ${confusionThreshold}, switching to explain`;
      return { mode: 'explain', reason };
    }
    reason.primaryReason = `Confusion: streak ${modeState.confusionStreak} < threshold ${confusionThreshold}, simplifying`;
    return { mode: 'simplify', reason };
  }
  
  // Priority 3: Boredom/disengagement (deterministic logic)
  if (signals.boredom || intent === 'boredom') {
    // Check if boredom is due to too many questions
    if (modeState.questionStreak >= config.boredomQuestionStreakThreshold) {
      // Too many questions → try social mode or teach mode for empowerment
      // Deterministic: prefer social if not used recently, else teach, else simplify
      if (lastMode !== 'social' && !modeState.lastModes.slice(0, 2).includes('social')) {
        reason.primaryReason = `Boredom: question streak ${modeState.questionStreak} >= ${config.boredomQuestionStreakThreshold}, trying social mode`;
        return { mode: 'social', reason };
      }
      if (lastMode !== 'teach' && !modeState.lastModes.slice(0, 2).includes('teach')) {
        reason.primaryReason = `Boredom: question streak ${modeState.questionStreak} >= ${config.boredomQuestionStreakThreshold}, trying teach mode`;
        return { mode: 'teach', reason };
      }
      reason.primaryReason = `Boredom: question streak ${modeState.questionStreak} >= ${config.boredomQuestionStreakThreshold}, simplifying`;
      return { mode: 'simplify', reason };
    }
    
    // Don't do engage twice in a row
    if (lastMode === 'engage') {
      // Deterministic: prefer social if not used recently, else explain
      if (!modeState.lastModes.slice(0, 2).includes('social')) {
        reason.primaryReason = 'Boredom: last mode was engage, trying social';
        return { mode: 'social', reason };
      }
      reason.primaryReason = 'Boredom: last mode was engage, trying explain';
      return { mode: 'explain', reason };
    }
    reason.primaryReason = 'Boredom: engaging to re-engage';
    return { mode: 'engage', reason };
  }
  
  // Priority 4: Unclear input / silence
  if (intent === 'unclear' || intent === 'silence') {
    reason.primaryReason = 'Unclear input or silence, requesting clarification';
    return { mode: 'clarify', reason };
  }
  
  // Priority 5: Greeting
  if (intent === 'greeting') {
    reason.primaryReason = 'Greeting detected, engaging';
    return { mode: 'engage', reason };
  }
  
  // Priority 6: Entertainment requests (deterministic)
  if (intent === 'request_story' || intent === 'request_joke') {
    // Deterministic: suggest social if not used recently and turn count suggests it
    const shouldSuggestSocial = 
      lastMode !== 'social' && 
      !modeState.lastModes.slice(0, 3).includes('social') &&
      (modeState.turnCount % Math.round(1 / config.socialModeEntertainmentProbability) === 0);
    
    if (shouldSuggestSocial) {
      reason.primaryReason = 'Entertainment request: suggesting social activity';
      return { mode: 'social', reason };
    }
    reason.primaryReason = 'Entertainment request: engaging';
    return { mode: 'engage', reason };
  }
  
  // Priority 6.5: Activity/parent requests
  if (intent === 'request_activity' || intent === 'request_parent') {
    reason.primaryReason = 'Activity/parent request detected';
    return { mode: 'social', reason };
  }
  
  // Priority 7: Child is explaining (teach mode opportunity)
  if (intent === 'statement_explaining' || signals.explaining) {
    reason.primaryReason = 'Child explaining, using teach mode';
    return { mode: 'teach', reason };
  }
  
  // Priority 8: After successful engagement, maybe flip to teach mode (deterministic)
  if (modeState.engagementStreak >= config.teachModeEngagementStreak) {
    reason.thresholdsUsed!.engagement = config.teachModeEngagementStreak;
    // Deterministic: use turn count to decide (simulates probability)
    const shouldTryTeach = (modeState.turnCount % Math.round(1 / config.teachModeProbability)) === 0;
    if (shouldTryTeach && lastMode !== 'teach') {
      reason.primaryReason = `High engagement streak ${modeState.engagementStreak}, trying teach mode`;
      return { mode: 'teach', reason };
    }
  }
  
  // Priority 8.5: Proactive social mode rotation (every 4-5 turns)
  if (shouldTriggerProactiveSocial(modeState)) {
    reason.primaryReason = 'Proactive social mode rotation triggered';
    return { mode: 'social', reason };
  }
  
  // Priority 9: Questions from child
  if (intent.startsWith('question_')) {
    // If child showing effort, encourage first
    if (signals.effort && lastMode !== 'encourage') {
      reason.primaryReason = 'Question with effort signal, encouraging';
      return { mode: 'encourage', reason };
    }
    
    // Age-based question streak threshold
    const questionStreakThreshold = getQuestionStreakThreshold(ageGroup);
    reason.thresholdsUsed!.question = questionStreakThreshold;
    if (modeState.questionStreak >= questionStreakThreshold) {
      reason.primaryReason = `Question streak ${modeState.questionStreak} >= threshold ${questionStreakThreshold}, explaining`;
      return { mode: 'explain', reason };
    }
    
    // Age-based mode selection for questions
    const questionMode = selectModeForQuestion(ageGroup, lastMode, modeState);
    reason.primaryReason = `Question: age-based selection (${ageGroup})`;
    return { mode: questionMode, reason };
  }
  
  // Priority 10: Statements
  if (intent.startsWith('statement_')) {
    const statementMode = selectModeForStatement(ageGroup, modeState, signals);
    const diversityCheck = ensureModeVariety(modeState, ageGroup);
    if (diversityCheck && diversityCheck === statementMode) {
      reason.diversityOverride = true;
      reason.primaryReason = `Statement: diversity override applied`;
    } else {
      reason.primaryReason = `Statement: age-based selection (${ageGroup})`;
    }
    return { mode: statementMode, reason };
  }
  
  // Default: based on age group
  const defaultMode = getDefaultModeForAge(ageGroup);
  reason.primaryReason = `Default mode for age group ${ageGroup}`;
  return { mode: defaultMode, reason };
}

/**
 * Select mode for questions based on age group (deterministic)
 */
function selectModeForQuestion(
  ageGroup: AgeGroup, 
  lastMode: ResponseMode | undefined,
  modeState: ModeState
): ResponseMode {
  switch (ageGroup) {
    case 'early':
      // Younger children: more hints, simpler probing
      // Track hint streak to avoid immediate explain
      const hintCount = modeState.lastModes.filter(m => m === 'hint').length;
      if (lastMode === 'hint' && hintCount >= 2) {
        return 'explain'; // After 2 hints, explain
      }
      return 'hint';
      
    case 'elementary':
      // Mix of hints and probing (deterministic alternation)
      if (lastMode === 'probe') {
        return 'hint';
      }
      if (lastMode === 'hint') {
        return 'probe';
      }
      // First question: prefer hint for younger elementary
      return 'hint';
      
    case 'upper':
      // Older children: more probing, deeper thinking
      if (lastMode === 'probe') {
        return 'hint'; // Alternate to avoid repetition
      }
      return 'probe';
      
    default:
      return 'hint';
  }
}

/**
 * Select mode for statements based on age and engagement
 */
function selectModeForStatement(
  ageGroup: AgeGroup,
  modeState: ModeState,
  signals: PreClassification['signals']
): ResponseMode {
  const lastMode = modeState.lastModes[0];
  
  // If showing effort, encourage
  if (signals.effort && lastMode !== 'encourage') {
    return 'encourage';
  }
  
  // If engaged, might probe deeper
  if (signals.engagement) {
    if (lastMode !== 'probe') {
      return 'probe';
    }
  }
  
  // Use mode rotation instead of randomness for better balance
  const rotatedMode = ensureModeVariety(modeState, ageGroup);
  if (rotatedMode) {
    return rotatedMode;
  }
  
  // Age-based defaults with variety (fallback if rotation doesn't suggest)
  const config = getModeConfig();
  const distribution = config.statementModeDistribution[ageGroup];
  
  switch (ageGroup) {
    case 'early':
      // Young children: balanced distribution
      if (lastMode !== 'encourage' && getModeUsagePercent(modeState, 'encourage') < distribution.encourage) {
        return 'encourage';
      }
      if (lastMode !== 'hint' && getModeUsagePercent(modeState, 'hint') < distribution.learning * 0.5) {
        return 'hint';
      }
      if (lastMode !== 'engage' && getModeUsagePercent(modeState, 'engage') < distribution.engage) {
        return 'engage';
      }
      return 'hint'; // Default to learning
      
    case 'elementary':
      // Mix of modes with diversity check
      if (lastMode !== 'encourage' && getModeUsagePercent(modeState, 'encourage') < distribution.encourage) {
        return 'encourage';
      }
      if (lastMode !== 'probe' && getModeUsagePercent(modeState, 'probe') < distribution.learning) {
        return 'probe';
      }
      if (lastMode !== 'engage' && getModeUsagePercent(modeState, 'engage') < distribution.engage) {
        return 'engage';
      }
      return 'probe'; // Default to learning
      
    case 'upper':
      // More probing and teaching for older children
      if (lastMode !== 'probe' && getModeUsagePercent(modeState, 'probe') < distribution.learning) {
        return 'probe';
      }
      if (lastMode !== 'encourage' && getModeUsagePercent(modeState, 'encourage') < distribution.encourage) {
        return 'encourage';
      }
      if (distribution.teach && lastMode !== 'teach' && getModeUsagePercent(modeState, 'teach') < distribution.teach) {
        return 'teach';
      }
      if (lastMode !== 'engage' && getModeUsagePercent(modeState, 'engage') < distribution.engage) {
        return 'engage';
      }
      return 'probe'; // Default to learning
      
    default:
      return 'encourage';
  }
}

/**
 * Get default mode for age group when no specific signals
 */
function getDefaultModeForAge(ageGroup: AgeGroup): ResponseMode {
  switch (ageGroup) {
    case 'early':
      return 'encourage';
    case 'elementary':
      return 'probe';
    case 'upper':
      return 'probe';
    default:
      return 'encourage';
  }
}

/**
 * Get age-based question streak threshold (from config)
 */
function getQuestionStreakThreshold(ageGroup: AgeGroup): number {
  const config = getModeConfig();
  return config.questionStreakThresholds[ageGroup];
}

/**
 * Check if proactive social mode should trigger (deterministic)
 */
function shouldTriggerProactiveSocial(modeState: ModeState): boolean {
  const config = getModeConfig();
  
  // Trigger every N turns (configurable), but not if social was used recently
  if (modeState.turnCount > 0 && modeState.turnCount % config.socialModeRotationInterval === 0) {
    if (!modeState.lastModes.includes('social')) {
      return true;
    }
  }
  
  // Also trigger after N consecutive turns without social (deterministic)
  if (modeState.turnCount >= config.socialModeMinTurnsWithout && 
      modeState.lastModes.length >= config.socialModeMinTurnsWithout) {
    const recentModes = new Set(modeState.lastModes.slice(0, config.socialModeMinTurnsWithout));
    if (!recentModes.has('social')) {
      // Deterministic: trigger if it's been exactly N turns since last social
      const turnsSinceSocial = modeState.lastModes.findIndex(m => m === 'social');
      if (turnsSinceSocial === -1 || turnsSinceSocial >= config.socialModeMinTurnsWithout) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Ensure mode variety by checking if any mode is overused
 * Works better for early sessions
 */
function ensureModeVariety(modeState: ModeState, ageGroup: AgeGroup): ResponseMode | null {
  const config = getModeConfig();
  const recentModes = modeState.lastModes.slice(0, 5);
  
  // For early sessions, use softer check
  if (recentModes.length < config.minHistoryForDiversity) {
    // If we have 1-2 turns, just avoid immediate repetition
    if (recentModes.length >= 1 && recentModes[0] === modeState.currentMode) {
      const preferredModes = getPreferredModesForAge(ageGroup);
      const alternate = preferredModes.find(m => m !== modeState.currentMode);
      return alternate || null;
    }
    return null;
  }
  
  // Check if any mode is used >threshold% of the time
  const modeCounts: Record<ResponseMode, number> = {} as Record<ResponseMode, number>;
  recentModes.forEach(mode => {
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
  });
  
  // Find overused modes
  const threshold = recentModes.length * config.modeOveruseThreshold;
  const overusedModes = Object.entries(modeCounts)
    .filter(([_, count]) => count > threshold)
    .map(([mode]) => mode as ResponseMode);
  
  if (overusedModes.length === 0) return null;
  
  // Find underused modes based on age group
  const preferredModes = getPreferredModesForAge(ageGroup);
  const underusedModes = preferredModes.filter(
    mode => {
      const count = modeCounts[mode] || 0;
      // For early sessions, be more lenient
      const maxAllowed = recentModes.length < 5 ? 1 : Math.ceil(recentModes.length * config.modeOveruseThreshold);
      return count < maxAllowed;
    }
  );
  
  if (underusedModes.length > 0) {
    return underusedModes[0];
  }
  
  // If all preferred modes used, try alternate mode
  const lastMode = modeState.lastModes[0];
  return getAlternateMode(lastMode, ageGroup);
}

/**
 * Get preferred modes for age group
 */
function getPreferredModesForAge(ageGroup: AgeGroup): ResponseMode[] {
  switch (ageGroup) {
    case 'early':
      return ['encourage', 'hint', 'engage', 'social'];
    case 'elementary':
      return ['probe', 'encourage', 'engage', 'hint', 'social'];
    case 'upper':
      return ['probe', 'teach', 'encourage', 'engage', 'social'];
    default:
      return ['encourage', 'engage'];
  }
}

/**
 * Get alternate mode for variety
 */
function getAlternateMode(currentMode: ResponseMode, ageGroup: AgeGroup): ResponseMode {
  const alternates: Record<ResponseMode, ResponseMode[]> = {
    probe: ['hint', 'encourage', 'social'],
    hint: ['probe', 'explain', 'social'],
    explain: ['hint', 'probe', 'social'],
    encourage: ['probe', 'engage', 'social'],
    simplify: ['explain', 'encourage', 'social'],
    engage: ['probe', 'encourage', 'social'],
    redirect: ['engage', 'social'],
    clarify: ['hint', 'encourage'],
    teach: ['probe', 'encourage', 'social'],
    social: ['engage', 'encourage', 'probe'],
  };
  
  const options = alternates[currentMode] || ['encourage', 'engage'];
  return options[0];
}

/**
 * Get mode usage percentage in recent turns
 */
function getModeUsagePercent(modeState: ModeState, mode: ResponseMode): number {
  if (modeState.lastModes.length === 0) return 0;
  const count = modeState.lastModes.filter(m => m === mode).length;
  return count / modeState.lastModes.length;
}

/**
 * Enhanced logging with decision reasoning
 */
export interface ModeSelectionReason {
  primaryReason: string;
  secondaryReasons?: string[];
  intentSource: 'rule-based' | 'llm' | 'combined';
  thresholdsUsed?: {
    confusion?: number;
    question?: number;
    engagement?: number;
  };
  diversityOverride?: boolean;
}

/**
 * Log mode selection for debugging with enhanced reasoning
 */
export function logModeSelection(
  turnCount: number,
  preClass: PreClassification,
  selectedMode: ResponseMode,
  modeState: ModeState,
  reason?: ModeSelectionReason
): void {
  console.log(
    `[ModeState] Turn ${turnCount} | Pre-class: ${preClass.intent} (conf: ${preClass.confidence}%) | Selected: ${selectedMode}`
  );
  
  if (reason) {
    console.log(
      `[ModeState] Decision: ${reason.primaryReason} | Intent source: ${reason.intentSource}${reason.secondaryReasons ? ` | Also considered: ${reason.secondaryReasons.join(', ')}` : ''}`
    );
    if (reason.diversityOverride) {
      console.log(`[ModeState] Diversity override applied`);
    }
    if (reason.thresholdsUsed) {
      const thresholds = Object.entries(reason.thresholdsUsed)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`[ModeState] Thresholds: ${thresholds}`);
    }
  }
  
  console.log(
    `[ModeState] Signals: confusion=${preClass.signals.confusion}, boredom=${preClass.signals.boredom}, effort=${preClass.signals.effort}, engagement=${preClass.signals.engagement}, explaining=${preClass.signals.explaining}`
  );
  console.log(
    `[ModeState] State: { current: ${modeState.currentMode}, lastModes: [${modeState.lastModes.slice(0, 3).join(', ')}], qStreak: ${modeState.questionStreak}, confStreak: ${modeState.confusionStreak}, engStreak: ${modeState.engagementStreak} }`
  );
  
  // Log mode diversity
  if (modeState.lastModes.length >= 3) {
    const modeCounts: Record<string, number> = {};
    modeState.lastModes.forEach(m => {
      modeCounts[m] = (modeCounts[m] || 0) + 1;
    });
    const diversity = Object.entries(modeCounts)
      .map(([mode, count]) => `${mode}:${((count / modeState.lastModes.length) * 100).toFixed(0)}%`)
      .join(', ');
    console.log(`[ModeState] Mode diversity (last ${modeState.lastModes.length}): ${diversity}`);
  }
  
  // Log LLM intent info if available
  if (modeState.previousLLMIntent) {
    console.log(
      `[ModeState] Previous LLM intent: ${modeState.previousLLMIntent} (conf: ${modeState.previousLLMConfidence}%)`
    );
  }
}

