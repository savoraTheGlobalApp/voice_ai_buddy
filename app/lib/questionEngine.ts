/**
 * Proactive Question Engine
 * Generates curiosity-inducing conversation starters based on Information Gap Theory
 * Implements 4 generative patterns: Did You Know, Would You Rather, Bridging, Information Gap
 */

import { SubAgeLevel, AgeGroup, getAgeGroupFromSubLevel } from './ageGroups';
import { UserMemory } from '@/lib/memories';

export type QuestionStrategy = 
  | 'did_you_know'      // Surprise-based fact
  | 'would_you_rather'  // Value-based dilemma
  | 'bridging'          // Connection-based analogy
  | 'information_gap';  // Curiosity-based partial scenario

export interface QuestionContext {
  userName?: string;
  userAge?: number;
  effectiveLevel: SubAgeLevel;
  topMemories?: UserMemory[];
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  dayOfWeek?: string;
}

export interface QuestionGrounding {
  strategy: QuestionStrategy;
  // For "did_you_know"
  fact?: string;
  topic?: string;
  surpriseScore?: number;
  // For "would_you_rather"
  option1?: string;
  option2?: string;
  // For "bridging"
  sourceDomain?: string;
  targetDomain?: string;
  analogyTemplate?: string;
  // For "information_gap"
  commonBelief?: string;
  actualFact?: string;
  // Common
  ageGroup: AgeGroup;
  personalization?: {
    userInterest?: string;
    memoryHook?: string;
  };
}

export interface GeneratedQuestion {
  grounding: QuestionGrounding;
  // Keep question for backwards compatibility during transition
  question?: string;
}

/**
 * Curated fact database for "Did You Know?" questions
 * Organized by age group and topic
 */
const SURPRISING_FACTS: Record<AgeGroup, Array<{ fact: string; topic: string; surpriseScore: number }>> = {
  early: [
    { fact: "Octopuses have three hearts!", topic: "animals", surpriseScore: 0.9 },
    { fact: "Bananas are berries, but strawberries aren't!", topic: "food", surpriseScore: 0.95 },
    { fact: "A group of flamingos is called a flamboyance!", topic: "animals", surpriseScore: 0.8 },
    { fact: "Honey never spoils - it can last forever!", topic: "food", surpriseScore: 0.85 },
    { fact: "A day on Venus is longer than a year on Venus!", topic: "space", surpriseScore: 0.9 },
    { fact: "Wombat poop is cube-shaped!", topic: "animals", surpriseScore: 0.95 },
    { fact: "Sharks have been around longer than trees!", topic: "animals", surpriseScore: 0.85 },
    { fact: "A cloud can weigh as much as a jumbo jet!", topic: "weather", surpriseScore: 0.8 },
  ],
  elementary: [
    { fact: "The human brain uses about 20% of the body's energy!", topic: "body", surpriseScore: 0.85 },
    { fact: "There are more possible games of chess than atoms in the observable universe!", topic: "games", surpriseScore: 0.9 },
    { fact: "A single cloud can hold millions of gallons of water!", topic: "weather", surpriseScore: 0.8 },
    { fact: "The speed of light is so fast, it could go around Earth 7.5 times in one second!", topic: "science", surpriseScore: 0.9 },
    { fact: "Your DNA, if stretched out, would reach to the sun and back 600 times!", topic: "body", surpriseScore: 0.95 },
    { fact: "There are more stars in the universe than grains of sand on all beaches!", topic: "space", surpriseScore: 0.9 },
  ],
  upper: [
    { fact: "Time moves slower near massive objects - GPS satellites have to account for this!", topic: "science", surpriseScore: 0.9 },
    { fact: "The human brain contains approximately 86 billion neurons!", topic: "body", surpriseScore: 0.85 },
    { fact: "Black holes can have temperatures, even though nothing can escape them!", topic: "space", surpriseScore: 0.95 },
    { fact: "Quantum particles can be in two places at once until observed!", topic: "science", surpriseScore: 0.9 },
  ],
};

/**
 * "Would You Rather" dilemmas organized by age group
 */
const WOULD_YOU_RATHER_OPTIONS: Record<AgeGroup, Array<{ option1: string; option2: string; topic: string }>> = {
  early: [
    { option1: "have fingers as long as your legs", option2: "have legs as short as your fingers", topic: "body" },
    { option1: "be able to fly like a bird", option2: "swim like a dolphin", topic: "animals" },
    { option1: "have a pet dinosaur that fits in your pocket", option2: "a pet dragon that can fly you to school", topic: "animals" },
    { option1: "eat ice cream for every meal", option2: "never have to sleep", topic: "choices" },
    { option1: "be able to talk to animals", option2: "understand every language in the world", topic: "superpowers" },
  ],
  elementary: [
    { option1: "have the ability to time travel to the past", option2: "travel to the future", topic: "time" },
    { option1: "be invisible whenever you want", option2: "be able to read minds", topic: "superpowers" },
    { option1: "live in a treehouse in the forest", option2: "live in an underwater city", topic: "places" },
    { option1: "have super strength", option2: "have super speed", topic: "superpowers" },
  ],
  upper: [
    { option1: "know everything about the past", option2: "know everything about the future", topic: "knowledge" },
    { option1: "be able to solve any math problem instantly", option2: "be able to speak every language fluently", topic: "skills" },
    { option1: "have the power to heal any illness", option2: "have the power to end world hunger", topic: "ethics" },
  ],
};

/**
 * Common misconceptions for "Information Gap" questions
 */
const MISCONCEPTIONS: Record<AgeGroup, Array<{ common: string; actual: string; topic: string }>> = {
  early: [
    { common: "deserts are always hot", actual: "the biggest desert (Antarctica) is freezing cold", topic: "geography" },
    { common: "bats are blind", actual: "bats can see, they just use sound to find things in the dark", topic: "animals" },
    { common: "the sun is yellow", actual: "the sun is actually white, it just looks yellow from Earth", topic: "space" },
  ],
  elementary: [
    { common: "lightning never strikes the same place twice", actual: "lightning can strike the same place many times", topic: "weather" },
    { common: "you swallow spiders in your sleep", actual: "this is a myth - spiders avoid sleeping humans", topic: "myths" },
    { common: "the Great Wall of China is visible from space", actual: "it's not visible from space with the naked eye", topic: "geography" },
  ],
  upper: [
    { common: "humans only use 10% of their brain", actual: "humans use all parts of their brain, just not all at once", topic: "body" },
    { common: "chameleons change color to blend in", actual: "they change color to communicate and regulate temperature", topic: "animals" },
  ],
};

/**
 * Generate "Did You Know?" grounding (Surprise-Based)
 * Returns grounding data for RAG - LLM will generate the actual question
 */
function generateDidYouKnow(context: QuestionContext, ageGroup: AgeGroup): GeneratedQuestion {
  const facts = SURPRISING_FACTS[ageGroup];
  
  // If we have memories, try to match topic
  let selectedFact = facts[Math.floor(Math.random() * facts.length)];
  let userInterest: string | undefined;
  
  if (context.topMemories && context.topMemories.length > 0) {
    // Find memories related to topics
    const memoryTopics = extractTopicsFromMemories(context.topMemories);
    const matchingFact = facts.find(f => 
      memoryTopics.some(topic => f.topic.includes(topic) || topic.includes(f.topic))
    );
    if (matchingFact) {
      selectedFact = matchingFact;
      userInterest = memoryTopics.find(t => selectedFact.topic.includes(t) || t.includes(selectedFact.topic));
    }
  }
  
  const grounding: QuestionGrounding = {
    strategy: 'did_you_know',
    fact: selectedFact.fact,
    topic: selectedFact.topic,
    surpriseScore: selectedFact.surpriseScore,
    ageGroup,
    personalization: userInterest ? { userInterest } : undefined,
  };
  
  return {
    grounding,
    // Keep formatted question for backwards compatibility (will be removed)
    question: `Did you know that ${selectedFact.fact.toLowerCase()}`,
  };
}

/**
 * Generate "Would You Rather?" grounding (Value-Based)
 * Returns grounding data for RAG - LLM will generate the actual question
 */
function generateWouldYouRather(context: QuestionContext, ageGroup: AgeGroup): GeneratedQuestion {
  const options = WOULD_YOU_RATHER_OPTIONS[ageGroup];
  const selected = options[Math.floor(Math.random() * options.length)];
  
  const grounding: QuestionGrounding = {
    strategy: 'would_you_rather',
    option1: selected.option1,
    option2: selected.option2,
    topic: selected.topic,
    ageGroup,
    personalization: context.userName ? { userInterest: context.userName } : undefined,
  };
  
  return {
    grounding,
    // Keep formatted question for backwards compatibility
    question: `Would you rather ${selected.option1} or ${selected.option2}?`,
  };
}

/**
 * Generate "Bridging" Analogy grounding (Connection-Based)
 * Returns grounding data for RAG - LLM will generate the actual question
 */
function generateBridging(context: QuestionContext, ageGroup: AgeGroup): GeneratedQuestion {
  // Extract interests from memories
  const interests = extractTopicsFromMemories(context.topMemories || []);
  
  // Common bridging analogies by age group
  const analogies: Record<AgeGroup, Array<{ source: string; target: string; question: string }>> = {
    early: [
      { source: "body", target: "castle", question: "Imagine your body is like a castle. If germs are invaders trying to get in, what do you think acts like the knights protecting the gates?" },
      { source: "plants", target: "kitchen", question: "Plants are like tiny kitchens! They make their own food using sunlight. What do you think they 'cook'?" },
      { source: "heart", target: "pump", question: "Your heart is like a pump that pushes water through pipes. What do you think it's pumping through your body?" },
    ],
    elementary: [
      { source: "electricity", target: "water", question: "Electricity flows like water through a river. What do you think the 'river' for electricity is made of?" },
      { source: "brain", target: "computer", question: "Your brain is like a super computer that controls everything. What do you think is the 'power button' for your brain?" },
    ],
    upper: [
      { source: "atoms", target: "solar system", question: "Atoms are like tiny solar systems with a nucleus as the sun. What do you think orbits around it?" },
      { source: "internet", target: "postal system", question: "The internet works like a super-fast postal system. What do you think are the 'letters' being delivered?" },
    ],
  };
  
  const ageAnalogies = analogies[ageGroup];
  let selected = ageAnalogies[Math.floor(Math.random() * ageAnalogies.length)];
  let userInterest: string | undefined;
  
  // Try to match with user interests
  if (interests.length > 0) {
    const matching = ageAnalogies.find(a => 
      interests.some(i => a.source.includes(i) || a.target.includes(i))
    );
    if (matching) {
      selected = matching;
      userInterest = interests.find(i => selected.source.includes(i) || selected.target.includes(i));
    }
  }
  
  const grounding: QuestionGrounding = {
    strategy: 'bridging',
    sourceDomain: selected.source,
    targetDomain: selected.target,
    analogyTemplate: selected.question,
    ageGroup,
    personalization: userInterest ? { userInterest } : undefined,
  };
  
  return {
    grounding,
    // Keep formatted question for backwards compatibility
    question: selected.question,
  };
}

/**
 * Generate "Information Gap" grounding (Curiosity-Based)
 * Returns grounding data for RAG - LLM will generate the actual question
 */
function generateInformationGap(context: QuestionContext, ageGroup: AgeGroup): GeneratedQuestion {
  const misconceptions = MISCONCEPTIONS[ageGroup];
  const selected = misconceptions[Math.floor(Math.random() * misconceptions.length)];
  
  const grounding: QuestionGrounding = {
    strategy: 'information_gap',
    commonBelief: selected.common,
    actualFact: selected.actual,
    topic: selected.topic,
    ageGroup,
  };
  
  return {
    grounding,
    // Keep formatted question for backwards compatibility
    question: `Most people think ${selected.common}, but actually ${selected.actual}. Can you guess why that might be?`,
  };
}

/**
 * Extract topics/interests from user memories
 */
function extractTopicsFromMemories(memories: UserMemory[]): string[] {
  const topics: string[] = [];
  const topicKeywords = [
    'dinosaur', 'space', 'animal', 'car', 'game', 'toy', 'color', 'food',
    'sport', 'music', 'book', 'movie', 'plant', 'ocean', 'mountain', 'building',
  ];
  
  memories.forEach(memory => {
    const text = memory.text.toLowerCase();
    topicKeywords.forEach(keyword => {
      if (text.includes(keyword) && !topics.includes(keyword)) {
        topics.push(keyword);
      }
    });
  });
  
  return topics;
}

/**
 * Select strategy based on context (simple rotation for Phase 1)
 * Phase 2 will use Contextual Bandits
 */
function selectStrategy(context: QuestionContext): QuestionStrategy {
  const strategies: QuestionStrategy[] = ['did_you_know', 'would_you_rather', 'bridging', 'information_gap'];
  
  // Simple rotation based on time or random for Phase 1
  // Phase 2 will use engagement history
  const index = Math.floor(Math.random() * strategies.length);
  return strategies[index];
}

/**
 * Build RAG prompt from grounding data
 * This follows Information Gap Theory - creates curiosity gaps, not just states facts
 */
export function buildRAGPrompt(grounding: QuestionGrounding, context: QuestionContext): string {
  const { userName, timeOfDay } = context;
  const greeting = timeOfDay === 'morning' ? 'Good morning' : timeOfDay === 'evening' ? 'Good evening' : 'Hello';
  const namePart = userName ? `, ${userName}` : '';
  
  let prompt = '';
  
  switch (grounding.strategy) {
    case 'did_you_know':
      // RAG: Provide fact, LLM generates curiosity-inducing question
      prompt = `${greeting}${namePart}! I have an interesting fact: "${grounding.fact}" (Topic: ${grounding.topic}).

Generate a very short, age-appropriate greeting + hook. Keep it concrete and friendly:
- One short greeting (3-5 words) + the fact (1 short sentence)
- Then ask ONE simple, concrete question (no "why do you think" yet)
- Use Information Gap gently: invite curiosity without demanding an explanation
- Keep total length tight (aim <= ~18 words for early ages)

Good patterns:
- "Hi! Sharks are super old. Do you like sharks or dolphins more?"
- "Hello! Sharks lived before trees. Which animal do you like?"

Avoid:
- Long multi-clause questions
- "Why do you think..." on the first turn
- Abstract follow-ups before the child shows interest`;
      break;
      
    case 'would_you_rather':
      // RAG: Provide options, LLM generates natural dilemma question
      prompt = `${greeting}${namePart}! I have a fun dilemma for you with two options:
- Option 1: ${grounding.option1}
- Option 2: ${grounding.option2}
(Topic: ${grounding.topic})

Generate a natural, age-appropriate "Would you rather" question that:
- Presents both options clearly and playfully
- Makes the choice interesting and balanced (not obvious)
- Uses engaging, conversational language
- Encourages them to think about their preferences`;
      break;
      
    case 'bridging':
      // RAG: Provide analogy mapping, LLM generates bridging question
      prompt = `${greeting}${namePart}! Let's use an analogy: "${grounding.sourceDomain} is like ${grounding.targetDomain}".

Generate a very short, age-appropriate question with NO praise:
- One short greeting (2-4 words) + the analogy setup
- Ask ONE mapping question: "If [source element], what is [target element]?"
- Keep it concrete and concise
- Avoid praise or flattery ("great idea", etc.)

Example:
- "Hi! Internet is like mail. If emails are letters, what are servers like?"`;
      break;
      
    case 'information_gap':
      // RAG: Provide misconception, LLM generates gap-revealing question
      prompt = `${greeting}${namePart}! Quick fact:
- Most people think: "${grounding.commonBelief}"
- But actually: "${grounding.actualFact}" (Topic: ${grounding.topic})

Generate a very short, age-appropriate question:
- One short greeting (2-4 words) + the fact (1 short sentence)
- Then ask ONE simple question: "Can you guess why?"
- Avoid praise or flattery (no "fascinating insight")
- Keep it concise and concrete

Example:
- "Hi! Many think chameleons change to hide, but it's to communicate & stay comfy. Can you guess why?"`;
      break;
  }
  
  // Add personalization if available
  if (grounding.personalization?.userInterest) {
    prompt += `\n\nPersonalization: The child is interested in ${grounding.personalization.userInterest}. Try to connect the question to this interest if natural.`;
  }
  
  prompt += `\n\nIMPORTANT: Generate ONLY the question and greeting. Make it natural, warm, and age-appropriate for ${grounding.ageGroup} age group.`;
  
  return prompt;
}

/**
 * Main function: Generate proactive question grounding for greeting
 * Returns grounding data for RAG - use buildRAGPrompt() to create LLM prompt
 */
export function generateGreetingQuestion(context: QuestionContext): GeneratedQuestion {
  const ageGroup = getAgeGroupFromSubLevel(context.effectiveLevel);
  const strategy = selectStrategy(context);
  
  let question: GeneratedQuestion;
  
  switch (strategy) {
    case 'did_you_know':
      question = generateDidYouKnow(context, ageGroup);
      break;
    case 'would_you_rather':
      question = generateWouldYouRather(context, ageGroup);
      break;
    case 'bridging':
      question = generateBridging(context, ageGroup);
      break;
    case 'information_gap':
      question = generateInformationGap(context, ageGroup);
      break;
    default:
      // Fallback
      question = generateDidYouKnow(context, ageGroup);
  }
  
  console.log(`[QuestionEngine] Generated ${strategy} grounding:`, question.grounding);
  
  return question;
}

