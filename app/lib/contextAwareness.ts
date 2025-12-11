/**
 * Context Awareness Module
 * Detects environmental and temporal context for proactive question generation
 */

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * Get current time of day based on local time
 */
export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 17) {
    return 'afternoon';
  } else {
    return 'evening';
  }
}

/**
 * Get day of week name
 */
export function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Get full context object for question generation
 */
export interface ContextInfo {
  timeOfDay: TimeOfDay;
  dayOfWeek: string;
  hour: number;
  isWeekend: boolean;
}

export function getContextInfo(): ContextInfo {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = getDayOfWeek();
  
  return {
    timeOfDay: getTimeOfDay(),
    dayOfWeek,
    hour,
    isWeekend: dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday',
  };
}

