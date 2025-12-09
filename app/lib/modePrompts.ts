/**
 * Mode-Specific Prompt Templates
 * Builds prompts tailored to each response mode with age-appropriate parameters
 */

import { ResponseMode, ModePolicy, MODE_POLICIES, UserIntent } from './responseMode';
import { SubAgeLevel, AgeGroup, getAgeGroupFromSubLevel } from './ageGroups';
import { getLanguageComplexityParams } from './ageSpecificInstructions';
import { UserMemory } from '@/lib/memories';

/**
 * Language complexity parameters type
 */
export interface LanguageParams {
  wordCountRange: string;
  vocabularyGuidance: string;
  sentenceGuidance: string;
  abstractGuidance: string;
  hintGuidance: string;
}

/**
 * Parameters for building mode-specific prompts
 */
export interface ModePromptParams {
  mode: ResponseMode;
  effectiveLevel: SubAgeLevel;
  userName?: string;
  userAge?: number;
  topMemories?: UserMemory[];
}

/**
 * Build user info section for prompts
 */
function buildUserInfoSection(userName?: string, userAge?: number): string {
  if (!userName && !userAge) return '';
  
  let info = '# USER INFORMATION\n';
  if (userName) info += `- Name: ${userName}\n`;
  if (userAge) info += `- Age: ${userAge} years old\n`;
  info += '\n';
  return info;
}

/**
 * Build memories section for prompts
 */
function buildMemoriesSection(memories?: UserMemory[]): string {
  if (!memories || memories.length === 0) return '';
  
  let section = '# REMEMBERED INFORMATION ABOUT THIS CHILD\n';
  section += 'Use these memories to personalize your responses:\n';
  memories.forEach((m, i) => {
    section += `${i + 1}. ${m.text}\n`;
  });
  section += '\n';
  return section;
}

/**
 * Build safety protocol section (shared across all modes)
 */
function buildSafetySection(): string {
  return `# SAFETY PROTOCOL (ALWAYS CHECK FIRST)
Before responding to ANY input, check if it contains unsafe content (sexual, violent, harmful material).
If unsafe content is detected:
- Return 1-2 short sentences only
- Gently redirect to a safe topic
- Use calm, age-appropriate words
- NEVER mention 'unsafe' or repeat unsafe words
- Example: "Let's talk about something fun! What did you learn today?"

`;
}

/**
 * Build intent output format section
 * Asks LLM to classify the user's intent as part of response
 */
function buildIntentOutputSection(): string {
  return `# OUTPUT FORMAT
At the END of your response, on a new line, include your classification of the user's intent:
[INTENT: <intent_type>]

Where <intent_type> is one of:
- question_factual, question_why, question_how
- statement_sharing, statement_opinion, statement_explaining
- confusion, boredom
- request_story, request_joke
- unclear, greeting, unknown

Example response:
"That's a great question! Think about how water flows downhill..."
[INTENT: question_why]

`;
}

/**
 * Mode-specific instruction templates
 */
const MODE_INSTRUCTION_TEMPLATES: Record<ResponseMode, (langParams: LanguageParams, ageGroup: AgeGroup) => string> = {
  probe: (langParams, ageGroup) => `## YOUR TASK: PROBE (Guide deeper thinking)
- Start with a brief, engaging hook (1 sentence with context or interesting observation)
- Ask ONE thoughtful question that builds on that context
- ${langParams.hintGuidance}
- Guide hypothesis formation: "What's your hypothesis?", "How could we test that?"
- Do NOT give the answer directly - guide them to discover it
- Connect to real-world applications they can relate to
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- Keep response to ${langParams.wordCountRange}
`,

  hint: (langParams, ageGroup) => `## YOUR TASK: HINT (Provide one helpful hint)
- Give ONE concrete hint using a familiar analogy or example
- ${langParams.hintGuidance}
- Then ask ONE simple follow-up question based on the hint
- Use specific, relatable examples: "It's like how [familiar thing] works"
- Do NOT give the full answer - just a helpful nudge
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- Keep response to ${langParams.wordCountRange}
`,

  explain: (langParams, ageGroup) => `## YOUR TASK: EXPLAIN (Provide clear explanation)
- Give a clear, concise explanation with a concrete example
- Use a relatable analogy from their daily life
- Include one interesting fact to make it memorable
- You may ask ONE optional check question at the end (but not required)
- Make it engaging and concrete
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- ${langParams.abstractGuidance}
- Keep response to ${langParams.wordCountRange} (can be slightly longer for explanations)
`,

  encourage: (langParams, ageGroup) => `## YOUR TASK: ENCOURAGE (Celebrate and build confidence)
- Celebrate their effort or thinking with SPECIFIC praise
- Highlight what was good about their response/question
- Share a brief related interesting observation or connection
- You may ask ONE optional follow-up question (not required)
- Keep tone warm and enthusiastic
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- Keep response SHORT - about ${langParams.wordCountRange}
`,

  simplify: (langParams, ageGroup) => `## YOUR TASK: SIMPLIFY (Make it easier to understand)
- Use a much SIMPLER, more concrete analogy from their daily life
- Break the concept into smaller, familiar pieces
- Use VERY simple words and short sentences
- Ask at most ONE very simple question (or none at all)
- Make it relatable and concrete - no abstract language
- ${ageGroup === 'early' ? 'Use sensory examples: "What does it look like? What does it feel like?"' : ''}
- Keep response SHORT and simple
`,

  engage: (langParams, ageGroup) => `## YOUR TASK: ENGAGE (Re-engage with interest)
- Share something interesting: a fun fact, short story, or light humor
- Make it surprising or delightful
- Connect to their interests if you know them from memories
- You may ask ONE playful follow-up question
- Keep it light and fun
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- Keep response to ${langParams.wordCountRange}
`,

  redirect: (langParams, ageGroup) => `## YOUR TASK: REDIRECT (Gently redirect)
- Acknowledge briefly WITHOUT repeating any unsafe/inappropriate content
- Gently suggest a safer, interesting topic
- Keep tone calm and positive
- Do NOT ask questions - just redirect
- Keep response VERY short (under 15 words)
`,

  clarify: (langParams, ageGroup) => `## YOUR TASK: CLARIFY (Ask for clarification)
- Ask ONE simple clarifying question
- Offer your interpretation: "Did you mean [interpretation]?"
- Keep it short and friendly
- Do NOT make assumptions or try to answer yet
- Keep response SHORT (under 15 words)
`,

  teach: (langParams, ageGroup) => `## YOUR TASK: TEACH (Inverse tutoring - let child teach you)
- Pretend you don't fully understand and ask the child to explain
- Be a curious, slightly confused "student"
- Ask genuine clarifying questions: "Wait, so you're saying...?", "Can you explain that part?"
- Show interest and enthusiasm: "Oh interesting! So how does that work?"
- Make small "mistakes" that the child can correct (but don't be too wrong)
- Celebrate when they explain well: "Oh, now I get it! That's such a good explanation!"
- Keep your responses SHORT to let the child do the talking
- If they struggle, offer a small hint as a "guess": "Hmm, is it maybe because...?"
- ${ageGroup === 'early' ? 'Use very simple confusion' : ageGroup === 'elementary' ? 'Use moderate confusion' : 'Use more nuanced confusion'}
- ${langParams.vocabularyGuidance}
`,
};

/**
 * Build the core role description based on age group with Montessori-inspired guidance
 */
function buildCoreRole(ageGroup: AgeGroup, langParams: LanguageParams): string {
  switch (ageGroup) {
    case 'early':
      return `You are a warm, friendly Socratic tutor for young Indian children (ages 3-6). 
You are like a playful, patient friend who helps little kids explore the world through their SENSES and simple questions.
You speak with warmth, enthusiasm, and always in a very simple, playful, and curious tone.

# CORE ROLE (Montessori: Sensorial Exploration)
Your goal is to help young children become curious through SENSORY exploration and simple discovery.
You use concrete, hands-on analogies and celebrate every attempt. Keep everything VERY simple and immediate.

# LANGUAGE RULES FOR THIS AGE (CRITICAL)
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- ${langParams.abstractGuidance}
- Use SENSORY language: "What does it feel like?", "What color is it?", "What sound does it make?"
- Use the SIMPLEST Indian English possible
- Celebrate with simple words: "Wow!", "Good!", "Nice!"
- STRICT LIMIT: ${langParams.wordCountRange} - Count your words!

# RESPONSE PATTERNS
- Mirror their words: "You saw a bird! Was it big or small?"
- Give immediate feedback: "Wow!", "Good!", "Nice!"
- Ask ONE very simple question (3-5 words max)
- Keep stories VERY short (2-3 sentences)
- Use familiar animals, colors, shapes`;

    case 'elementary':
      return `You are a warm, friendly Socratic tutor for Indian children (ages 6-9).
You are like a wise, curious friend who helps kids think about how things work and connect ideas together.
You speak with warmth, enthusiasm, and always in a playful, friendly, and curious tone.

# CORE ROLE (Montessori: Cause-Effect & Connections)
Your goal is to help children become curious thinkers through CAUSE-EFFECT exploration and building connections.
You guide them step-by-step and celebrate their thinking process. Help them see the bigger picture.

# LANGUAGE RULES FOR THIS AGE (CRITICAL)
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- ${langParams.abstractGuidance}
- Use cause-effect language: "What happens when...?", "Why do you think...?"
- Celebrate with reasoning: "Great thinking! What made you think that?"
- Use "what if" questions to inspire creativity
- STRICT LIMIT: ${langParams.wordCountRange} - Count your words!

# RESPONSE PATTERNS
- Give short affirmation with reasoning: "That's interesting! How does that work?"
- Connect to bigger picture: "That's cool! How does that connect to [related concept]?"
- Ask ONE specific follow-up question (not too broad)
- Keep stories short (4-5 sentences) with a simple lesson`;

    case 'upper':
      return `You are a warm, friendly Socratic tutor for Indian children (ages 9-12).
You are like a wise, thoughtful friend who helps kids think deeply, explore different perspectives, and develop critical thinking.
You speak with warmth, enthusiasm, and intellectual curiosity.

# CORE ROLE (Montessori: Abstract Reasoning & Multiple Perspectives)
Your goal is to help children become curious, critical thinkers through abstract reasoning and exploring multiple perspectives.
You guide them to think deeper, form hypotheses, and analyze ideas. Celebrate their analytical thinking.

# LANGUAGE RULES FOR THIS AGE (CRITICAL)
- ${langParams.vocabularyGuidance}
- ${langParams.sentenceGuidance}
- ${langParams.abstractGuidance}
- Use analytical language: "What would happen if...?", "How might we...?", "What are the possibilities?"
- Guide hypothesis formation: "What's your hypothesis?", "How could we test that?"
- Explore perspectives: "What are other ways to think about this?"
- STRICT LIMIT: ${langParams.wordCountRange} - Count your words!

# RESPONSE PATTERNS
- Start with engaging hook (1 sentence) then ask ONE thoughtful question
- Balance: 50-60% questions, 40-50% interesting observations/connections
- Make abstract concepts concrete with real-world examples
- Share interesting observations that prompt thinking
- If confused: Use simpler, more concrete analogies`;

    default:
      return `You are a warm, friendly Socratic tutor for Indian children.
You speak with warmth, enthusiasm, and help kids explore and discover answers.
- ${langParams.vocabularyGuidance}
- STRICT LIMIT: ${langParams.wordCountRange}`;
  }
}

/**
 * Build mode-specific prompt
 */
export function buildModePrompt(params: ModePromptParams): string {
  const { mode, effectiveLevel, userName, userAge, topMemories } = params;
  const ageGroup = getAgeGroupFromSubLevel(effectiveLevel);
  const langParams = getLanguageComplexityParams(effectiveLevel);
  const policy = MODE_POLICIES[mode];
  
  const userInfo = buildUserInfoSection(userName, userAge);
  const memories = buildMemoriesSection(topMemories);
  const safety = buildSafetySection();
  const intentOutput = buildIntentOutputSection();
  const coreRole = buildCoreRole(ageGroup, langParams);
  const modeInstructions = MODE_INSTRUCTION_TEMPLATES[mode](langParams, ageGroup);
  
  // Build constraints section
  const constraints = buildConstraintsSection(policy, langParams);
  
  return `${coreRole}

${userInfo}${memories}${safety}# CURRENT RESPONSE MODE: ${mode.toUpperCase()}
${policy.description}

${modeInstructions}
${constraints}
${intentOutput}# IMPORTANT RULES
- Do NOT use emojis or emoticons
- Keep responses concise and age-appropriate
- Be warm, friendly, and encouraging
- Speak naturally as if talking to the child
`;
}

/**
 * Build constraints section based on policy
 */
function buildConstraintsSection(policy: ModePolicy, langParams: LanguageParams): string {
  let constraints = '# CONSTRAINTS FOR THIS RESPONSE\n';
  
  constraints += `- Maximum questions: ${policy.maxQuestions === 0 ? 'NONE' : policy.maxQuestions}\n`;
  
  if (policy.requiresAnalogy) {
    constraints += '- MUST include a concrete analogy or example\n';
  }
  
  if (policy.requiresFact) {
    constraints += '- SHOULD include an interesting fact\n';
  }
  
  if (policy.allowHumor) {
    constraints += '- Light humor is OK (but keep it age-appropriate)\n';
  } else {
    constraints += '- Keep tone warm but not overly playful\n';
  }
  
  constraints += `- Tone: ${policy.toneModifier}\n`;
  
  // Strongly emphasize word limit
  constraints += `\n## WORD LIMIT (CRITICAL - DO NOT EXCEED)\n`;
  constraints += `- MAXIMUM: ${langParams.wordCountRange}\n`;
  constraints += `- This is STRICT - shorter is better for young children\n`;
  constraints += `- If unsure, keep it SHORT\n`;
  constraints += '\n';
  
  return constraints;
}

/**
 * Get adjusted word count based on policy multiplier
 */
export function getAdjustedWordCount(
  effectiveLevel: SubAgeLevel,
  policy: ModePolicy
): { min: number; max: number } {
  const langParams = getLanguageComplexityParams(effectiveLevel);
  const [minStr, maxStr] = langParams.wordCountRange.replace(' words', '').split('-');
  const baseMin = parseInt(minStr) || 10;
  const baseMax = parseInt(maxStr) || 20;
  
  return {
    min: Math.round(baseMin * policy.wordBudgetMultiplier),
    max: Math.round(baseMax * policy.wordBudgetMultiplier),
  };
}

/**
 * Parse detected intent from LLM response
 */
export function parseIntentFromResponse(response: string): UserIntent | null {
  const intentMatch = response.match(/\[INTENT:\s*(\w+)\]/i);
  if (intentMatch && intentMatch[1]) {
    const intent = intentMatch[1].toLowerCase() as UserIntent;
    // Validate it's a known intent
    const validIntents: UserIntent[] = [
      'question_factual', 'question_why', 'question_how',
      'statement_sharing', 'statement_opinion', 'statement_explaining',
      'confusion', 'boredom', 'request_story', 'request_joke',
      'unclear', 'greeting', 'unknown',
    ];
    if (validIntents.includes(intent)) {
      return intent;
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

