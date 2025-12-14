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

// Confusion patterns
const CONFUSION_PATTERNS = [
  /too (complicated|hard|difficult)/i,
  /don'?t (understand|get it|know)/i,
  /what do you mean/i,
  /confused/i,
  /huh\??/i,
  /i'?m lost/i,
  /can you (explain|say) (that |it )?(again|simply)/i,
  /i (don'?t|do not) (get|understand)/i,
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
const EFFORT_PATTERNS = [
  /i think/i,
  /maybe/i,
  /i guess/i,
  /probably/i,
  /could it be/i,
  /is it (because|that)/i,
  /i wonder/i,
];

// Entertainment request patterns
const STORY_PATTERNS = [/tell (me )?(a )?story/i, /story please/i, /can you tell/i];
const JOKE_PATTERNS = [/tell (me )?(a )?joke/i, /joke please/i, /something funny/i];

// Greeting patterns
const GREETING_PATTERNS = [/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)\b/i];

// Unsafe content patterns (basic - should be expanded)
const UNSAFE_PATTERNS = [
  /\b(kill|die|dead|death|murder|blood)\b/i,
  /\b(sex|naked|porn)\b/i,
  /\b(drug|alcohol|drunk)\b/i,
  /\b(gun|weapon|bomb)\b/i,
];

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
  
  // Check for unsafe content first
  if (UNSAFE_PATTERNS.some(p => p.test(msg))) {
    result.intent = 'unsafe';
    result.confidence = 80;
    return result;
  }
  
  // Check signals
  result.signals.confusion = CONFUSION_PATTERNS.some(p => p.test(msg));
  result.signals.boredom = BOREDOM_PATTERNS.some(p => p.test(msg));
  result.signals.effort = EFFORT_PATTERNS.some(p => p.test(msg));
  result.signals.explaining = EXPLAINING_PATTERNS.some(p => p.test(msg));
  result.signals.engagement = msg.length > 50 || msg.split(' ').length > 10;
  
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
  
  if (WHAT_PATTERNS.some(p => p.test(msg)) || msg.includes('?')) {
    result.intent = 'question_factual';
    result.confidence = 70;
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
 * Mode selection state machine
 * Selects the appropriate response mode based on pre-classification and state
 */
export function selectMode(
  preClass: PreClassification,
  modeState: ModeState,
  effectiveLevel: SubAgeLevel
): ResponseMode {
  const { intent, signals } = preClass;
  const ageGroup = getAgeGroupFromSubLevel(effectiveLevel);
  const lastMode = modeState.lastModes[0];
  
  // Priority 1: Safety redirect
  if (intent === 'unsafe') {
    return 'redirect';
  }
  
  // Priority 2: Confusion handling
  if (signals.confusion || intent === 'confusion') {
    // If already confused for 2+ turns, explain instead of more questions
    if (modeState.confusionStreak >= 2) {
      return 'explain';
    }
    return 'simplify';
  }
  
  // Priority 3: Boredom/disengagement
  if (signals.boredom || intent === 'boredom') {
    // Don't do engage twice in a row
    if (lastMode === 'engage') {
      return 'explain'; // Try explaining with interesting fact
    }
    return 'engage';
  }
  
  // Priority 4: Unclear input / silence
  if (intent === 'unclear' || intent === 'silence') {
    return 'clarify';
  }
  
  // Priority 5: Greeting
  if (intent === 'greeting') {
    return 'engage';
  }
  
  // Priority 6: Entertainment requests
  if (intent === 'request_story' || intent === 'request_joke') {
    return 'engage';
  }
  
  // Priority 7: Child is explaining (teach mode opportunity)
  if (intent === 'statement_explaining' || signals.explaining) {
    return 'teach';
  }
  
  // Priority 8: After successful engagement, maybe flip to teach mode
  if (modeState.engagementStreak >= 3 && Math.random() < 0.25) {
    // 25% chance to try teach mode when child is engaged
    if (lastMode !== 'teach') {
      return 'teach';
    }
  }
  
  // Priority 9: Questions from child
  if (intent.startsWith('question_')) {
    // If child showing effort, encourage first
    if (signals.effort && lastMode !== 'encourage') {
      return 'encourage';
    }
    
    // If asked too many questions recently without answering, explain
    if (modeState.questionStreak >= 3) {
      return 'explain';
    }
    
    // Age-based mode selection for questions
    return selectModeForQuestion(ageGroup, lastMode);
  }
  
  // Priority 10: Statements
  if (intent.startsWith('statement_')) {
    return selectModeForStatement(ageGroup, modeState, signals);
  }
  
  // Default: based on age group
  return getDefaultModeForAge(ageGroup);
}

/**
 * Select mode for questions based on age group
 */
function selectModeForQuestion(ageGroup: AgeGroup, lastMode: ResponseMode | undefined): ResponseMode {
  switch (ageGroup) {
    case 'early':
      // Younger children: more hints, simpler probing
      if (lastMode === 'hint') {
        return 'explain'; // After hint, maybe explain
      }
      return 'hint';
      
    case 'elementary':
      // Mix of hints and probing
      if (lastMode === 'probe') {
        return 'hint';
      }
      if (lastMode === 'hint') {
        return 'probe';
      }
      return Math.random() < 0.5 ? 'probe' : 'hint';
      
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
  
  // Vary response to avoid repetition
  const rand = Math.random();
  
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
  
  // Age-based defaults with variety
  switch (ageGroup) {
    case 'early':
      // Young children: more encouragement and engagement
      if (rand < 0.5 && lastMode !== 'encourage') return 'encourage';
      if (rand < 0.8 && lastMode !== 'engage') return 'engage';
      return 'hint';
      
    case 'elementary':
      // Mix of modes
      if (rand < 0.4 && lastMode !== 'encourage') return 'encourage';
      if (rand < 0.7 && lastMode !== 'probe') return 'probe';
      return 'engage';
      
    case 'upper':
      // More probing and teaching for older children
      if (rand < 0.4 && lastMode !== 'probe') return 'probe';
      if (rand < 0.6 && lastMode !== 'encourage') return 'encourage';
      if (rand < 0.8 && lastMode !== 'teach') return 'teach';
      return 'engage';
      
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
 * Log mode selection for debugging
 */
export function logModeSelection(
  turnCount: number,
  preClass: PreClassification,
  selectedMode: ResponseMode,
  modeState: ModeState
): void {
  console.log(
    `[ModeState] Turn ${turnCount} | Pre-class: ${preClass.intent} (conf: ${preClass.confidence}) | Selected: ${selectedMode}`
  );
  console.log(
    `[ModeState] Signals: confusion=${preClass.signals.confusion}, boredom=${preClass.signals.boredom}, effort=${preClass.signals.effort}, engagement=${preClass.signals.engagement}, explaining=${preClass.signals.explaining}`
  );
  console.log(
    `[ModeState] State: { current: ${modeState.currentMode}, lastModes: [${modeState.lastModes.slice(0, 3).join(', ')}], qStreak: ${modeState.questionStreak}, confStreak: ${modeState.confusionStreak}, engStreak: ${modeState.engagementStreak} }`
  );
}

