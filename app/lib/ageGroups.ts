/**
 * Age Group Configuration
 * Based on Montessori and Child Psychology principles
 */

export type AgeGroup = 'early' | 'elementary' | 'upper';

export type SubAgeLevel = 
  // Early (3-6)
  | 'early_low'    // 3-4 years
  | 'early_mid'    // 4-5 years  
  | 'early_high'   // 5-6 years
  // Elementary (6-9)
  | 'elem_low'     // 6-7 years
  | 'elem_mid'     // 7-8 years
  | 'elem_high'    // 8-9 years
  // Upper (9-12)
  | 'upper_low'    // 9-10 years
  | 'upper_mid'    // 10-11 years
  | 'upper_high';  // 11-12 years

export interface AgeGroupConfig {
  name: string;
  range: { min: number; max: number };
  montessoriFocus: string;
  psychologyStage: string;
  description: string;
}

export interface SubAgeLevelConfig {
  level: SubAgeLevel;
  ageRange: { min: number; max: number };
  wordCountRange: { min: number; max: number };
  vocabularyComplexity: 'very_simple' | 'simple' | 'moderate' | 'complex';
  sentenceStructure: 'fragments' | 'simple' | 'compound' | 'complex';
  abstractConcepts: boolean; // Whether to introduce abstract concepts
  hintComplexity: 'immediate' | 'simple' | 'progressive' | 'deep';
  responseLength: { min: number; max: number }; // Words in AI response
}

export const AGE_GROUPS: Record<AgeGroup, AgeGroupConfig> = {
  early: {
    name: 'Early Childhood',
    range: { min: 3, max: 6 },
    montessoriFocus: 'Sensorial exploration, practical life, language acquisition',
    psychologyStage: 'Pre-operational stage, concrete thinking',
    description: 'Ages 3-6: Focus on sensory experiences, simple language, and immediate feedback',
  },
  elementary: {
    name: 'Lower Elementary',
    range: { min: 6, max: 9 },
    montessoriFocus: 'Cosmic education, big picture thinking, cause and effect',
    psychologyStage: 'Concrete operational stage, logical thinking emerges',
    description: 'Ages 6-9: Focus on cause-effect relationships, building connections, and step-by-step thinking',
  },
  upper: {
    name: 'Upper Elementary',
    range: { min: 9, max: 12 },
    montessoriFocus: 'Abstract reasoning, research skills, peer collaboration',
    psychologyStage: 'Transition to formal operations, abstract thinking',
    description: 'Ages 9-12: Focus on abstract concepts, multiple perspectives, and deeper analysis',
  },
};

export const SUB_AGE_LEVELS: Record<SubAgeLevel, SubAgeLevelConfig> = {
  early_low: {
    level: 'early_low',
    ageRange: { min: 3, max: 4 },
    wordCountRange: { min: 8, max: 12 },
    vocabularyComplexity: 'very_simple',
    sentenceStructure: 'fragments',
    abstractConcepts: false,
    hintComplexity: 'immediate',
    responseLength: { min: 10, max: 20 },  // Updated: was 5-8, now allows 2-3 short sentences
  },
  early_mid: {
    level: 'early_mid',
    ageRange: { min: 4, max: 5 },
    wordCountRange: { min: 10, max: 15 },
    vocabularyComplexity: 'simple',
    sentenceStructure: 'simple',
    abstractConcepts: false,
    hintComplexity: 'simple',
    responseLength: { min: 12, max: 25 },  // Updated: was 8-12, now allows 3-4 short sentences
  },
  early_high: {
    level: 'early_high',
    ageRange: { min: 5, max: 6 },
    wordCountRange: { min: 12, max: 18 },
    vocabularyComplexity: 'simple',
    sentenceStructure: 'simple',
    abstractConcepts: true,
    hintComplexity: 'progressive',
    responseLength: { min: 15, max: 30 },  // Updated: was 10-15, transitional age
  },
  elem_low: {
    level: 'elem_low',
    ageRange: { min: 6, max: 7 },
    wordCountRange: { min: 15, max: 20 },
    vocabularyComplexity: 'moderate',
    sentenceStructure: 'compound',
    abstractConcepts: true,
    hintComplexity: 'progressive',
    responseLength: { min: 12, max: 25 },  // Reduced from 40 to 25 for age-appropriate length
  },
  elem_mid: {
    level: 'elem_mid',
    ageRange: { min: 7, max: 8 },
    wordCountRange: { min: 18, max: 25 },
    vocabularyComplexity: 'moderate',
    sentenceStructure: 'compound',
    abstractConcepts: true,
    hintComplexity: 'progressive',
    responseLength: { min: 15, max: 30 },  // Reduced from 50 to 30 for age-appropriate length
  },
  elem_high: {
    level: 'elem_high',
    ageRange: { min: 8, max: 9 },
    wordCountRange: { min: 20, max: 30 },
    vocabularyComplexity: 'moderate',
    sentenceStructure: 'complex',
    abstractConcepts: true,
    hintComplexity: 'progressive',
    responseLength: { min: 15, max: 35 },  // Reduced from 60 to 35 for age-appropriate length
  },
  upper_low: {
    level: 'upper_low',
    ageRange: { min: 9, max: 10 },
    wordCountRange: { min: 25, max: 35 },
    vocabularyComplexity: 'complex',
    sentenceStructure: 'complex',
    abstractConcepts: true,
    hintComplexity: 'progressive',
    responseLength: { min: 15, max: 35 },  // tightened for shorter responses
  },
  upper_mid: {
    level: 'upper_mid',
    ageRange: { min: 10, max: 11 },
    wordCountRange: { min: 30, max: 40 },
    vocabularyComplexity: 'complex',
    sentenceStructure: 'complex',
    abstractConcepts: true,
    hintComplexity: 'progressive',
    responseLength: { min: 15, max: 35 },  // tightened for shorter responses
  },
  upper_high: {
    level: 'upper_high',
    ageRange: { min: 11, max: 12 },
    wordCountRange: { min: 35, max: 45 },
    vocabularyComplexity: 'complex',
    sentenceStructure: 'complex',
    abstractConcepts: true,
    hintComplexity: 'deep',
    responseLength: { min: 18, max: 45 },  // tightened but allows some depth
  },
};

/**
 * Determines the age group for a given age
 * @param age - The child's age
 * @returns The age group category
 */
export function getAgeGroup(age?: number): AgeGroup | null {
  if (!age || age < 3 || age > 12) {
    return null;
  }

  if (age >= 3 && age < 6) {
    return 'early';
  } else if (age >= 6 && age < 9) {
    return 'elementary';
  } else if (age >= 9 && age <= 12) {
    return 'upper';
  }

  return null;
}

/**
 * Gets the age group configuration
 * @param age - The child's age
 * @returns The age group configuration or null
 */
export function getAgeGroupConfig(age?: number): AgeGroupConfig | null {
  const group = getAgeGroup(age);
  return group ? AGE_GROUPS[group] : null;
}

/**
 * Validates if an age is within the supported range
 * @param age - The age to validate
 * @returns True if age is valid (3-12)
 */
export function isValidAge(age?: number): boolean {
  return age !== undefined && age !== null && age >= 3 && age <= 12;
}

/**
 * Determines the sub-age level for a given chronological age
 * @param age - The child's chronological age
 * @returns The sub-age level category
 */
export function getSubAgeLevel(age?: number): SubAgeLevel | null {
  if (!age || age < 3 || age > 12) {
    return null;
  }

  if (age >= 3 && age < 4) return 'early_low';
  if (age >= 4 && age < 5) return 'early_mid';
  if (age >= 5 && age < 6) return 'early_high';
  if (age >= 6 && age < 7) return 'elem_low';
  if (age >= 7 && age < 8) return 'elem_mid';
  if (age >= 8 && age < 9) return 'elem_high';
  if (age >= 9 && age < 10) return 'upper_low';
  if (age >= 10 && age < 11) return 'upper_mid';
  if (age >= 11 && age <= 12) return 'upper_high';

  return null;
}

/**
 * Gets the sub-age level configuration
 * @param level - The sub-age level
 * @returns The sub-age level configuration or null
 */
export function getSubAgeLevelConfig(level: SubAgeLevel): SubAgeLevelConfig | null {
  return SUB_AGE_LEVELS[level] || null;
}

/**
 * Gets all sub-age levels in order (for transitions)
 * @returns Array of all sub-age levels in ascending order
 */
export function getAllSubLevels(): SubAgeLevel[] {
  return [
    'early_low',
    'early_mid',
    'early_high',
    'elem_low',
    'elem_mid',
    'elem_high',
    'upper_low',
    'upper_mid',
    'upper_high',
  ];
}

/**
 * Gets the next level up from a given level
 * @param level - Current sub-age level
 * @returns Next level up, or null if already at highest
 */
export function getNextLevel(level: SubAgeLevel): SubAgeLevel | null {
  const allLevels = getAllSubLevels();
  const currentIndex = allLevels.indexOf(level);
  if (currentIndex === -1 || currentIndex === allLevels.length - 1) {
    return null;
  }
  return allLevels[currentIndex + 1];
}

/**
 * Gets the previous level down from a given level
 * @param level - Current sub-age level
 * @returns Previous level down, or null if already at lowest
 */
export function getPreviousLevel(level: SubAgeLevel): SubAgeLevel | null {
  const allLevels = getAllSubLevels();
  const currentIndex = allLevels.indexOf(level);
  if (currentIndex === -1 || currentIndex === 0) {
    return null;
  }
  return allLevels[currentIndex - 1];
}

/**
 * Gets the base age group for a sub-age level
 * @param level - The sub-age level
 * @returns The base age group
 */
export function getAgeGroupFromSubLevel(level: SubAgeLevel): AgeGroup {
  if (level.startsWith('early')) return 'early';
  if (level.startsWith('elem')) return 'elementary';
  if (level.startsWith('upper')) return 'upper';
  return 'elementary'; // Default fallback
}

