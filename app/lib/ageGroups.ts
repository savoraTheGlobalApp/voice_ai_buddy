/**
 * Age Group Configuration
 * Based on Montessori and Child Psychology principles
 */

export type AgeGroup = 'early' | 'elementary' | 'upper';

export interface AgeGroupConfig {
  name: string;
  range: { min: number; max: number };
  montessoriFocus: string;
  psychologyStage: string;
  description: string;
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

