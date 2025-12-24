/**
 * Mode Effectiveness Metrics Tracking
 * Tracks mode performance and success signals
 */

import { ResponseMode, ModeState } from './responseMode';
import { PreClassification } from './responseMode';

/**
 * Metrics for a single mode
 */
export interface ModeMetrics {
  mode: ResponseMode;
  usageCount: number;
  successCount: number;  // Times followed by engagement (not confusion/boredom)
  confusionAfterCount: number;  // Times confusion occurred after this mode
  boredomAfterCount: number;  // Times boredom occurred after this mode
  engagementAfterCount: number;  // Times engagement occurred after this mode
  averageEngagementStreak: number;  // Average engagement streak after this mode
}

/**
 * Session metrics tracker
 */
export class ModeMetricsTracker {
  private metrics: Map<ResponseMode, ModeMetrics> = new Map();
  private lastMode: ResponseMode | null = null;
  private lastModeTurn: number = 0;
  
  constructor() {
    // Initialize metrics for all modes
    const allModes: ResponseMode[] = [
      'probe', 'hint', 'explain', 'encourage', 'simplify',
      'engage', 'redirect', 'clarify', 'teach', 'social'
    ];
    
    allModes.forEach(mode => {
      this.metrics.set(mode, {
        mode,
        usageCount: 0,
        successCount: 0,
        confusionAfterCount: 0,
        boredomAfterCount: 0,
        engagementAfterCount: 0,
        averageEngagementStreak: 0,
      });
    });
  }
  
  /**
   * Record mode usage
   */
  recordModeUsage(mode: ResponseMode, turnCount: number): void {
    const metrics = this.metrics.get(mode);
    if (metrics) {
      metrics.usageCount++;
      this.lastMode = mode;
      this.lastModeTurn = turnCount;
    }
  }
  
  /**
   * Record outcome after a mode was used
   */
  recordOutcome(
    preClass: PreClassification,
    modeState: ModeState,
    engagementStreak: number
  ): void {
    if (!this.lastMode) return;
    
    const metrics = this.metrics.get(this.lastMode);
    if (!metrics) return;
    
    // Check for success signals (engagement, effort, explaining)
    const isSuccess = 
      preClass.signals.engagement ||
      preClass.signals.effort ||
      preClass.signals.explaining ||
      engagementStreak > 0;
    
    // Check for failure signals (confusion, boredom)
    const hasConfusion = preClass.signals.confusion || preClass.intent === 'confusion';
    const hasBoredom = preClass.signals.boredom || preClass.intent === 'boredom';
    
    if (isSuccess && !hasConfusion && !hasBoredom) {
      metrics.successCount++;
    }
    
    if (hasConfusion) {
      metrics.confusionAfterCount++;
    }
    
    if (hasBoredom) {
      metrics.boredomAfterCount++;
    }
    
    if (preClass.signals.engagement || engagementStreak > 0) {
      metrics.engagementAfterCount++;
      // Update average engagement streak (simple moving average)
      const currentAvg = metrics.averageEngagementStreak;
      const count = metrics.engagementAfterCount;
      metrics.averageEngagementStreak = ((currentAvg * (count - 1)) + engagementStreak) / count;
    }
  }
  
  /**
   * Get metrics for a specific mode
   */
  getModeMetrics(mode: ResponseMode): ModeMetrics | undefined {
    return this.metrics.get(mode);
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics(): ModeMetrics[] {
    return Array.from(this.metrics.values());
  }
  
  /**
   * Get success rate for a mode
   */
  getSuccessRate(mode: ResponseMode): number {
    const metrics = this.metrics.get(mode);
    if (!metrics || metrics.usageCount === 0) return 0;
    return metrics.successCount / metrics.usageCount;
  }
  
  /**
   * Get confusion rate for a mode
   */
  getConfusionRate(mode: ResponseMode): number {
    const metrics = this.metrics.get(mode);
    if (!metrics || metrics.usageCount === 0) return 0;
    return metrics.confusionAfterCount / metrics.usageCount;
  }
  
  /**
   * Get boredom rate for a mode
   */
  getBoredomRate(mode: ResponseMode): number {
    const metrics = this.metrics.get(mode);
    if (!metrics || metrics.usageCount === 0) return 0;
    return metrics.boredomAfterCount / metrics.usageCount;
  }
  
  /**
   * Log summary of metrics
   */
  logSummary(): void {
    console.log('[ModeMetrics] === Mode Effectiveness Summary ===');
    const allMetrics = this.getAllMetrics()
      .filter(m => m.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount);
    
    allMetrics.forEach(metrics => {
      const successRate = this.getSuccessRate(metrics.mode);
      const confusionRate = this.getConfusionRate(metrics.mode);
      const boredomRate = this.getBoredomRate(metrics.mode);
      
      console.log(
        `[ModeMetrics] ${metrics.mode.padEnd(12)} | ` +
        `Usage: ${metrics.usageCount.toString().padStart(3)} | ` +
        `Success: ${(successRate * 100).toFixed(0)}% | ` +
        `Confusion: ${(confusionRate * 100).toFixed(0)}% | ` +
        `Boredom: ${(boredomRate * 100).toFixed(0)}% | ` +
        `Avg Eng Streak: ${metrics.averageEngagementStreak.toFixed(1)}`
      );
    });
    console.log('[ModeMetrics] ====================================');
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.forEach(metrics => {
      metrics.usageCount = 0;
      metrics.successCount = 0;
      metrics.confusionAfterCount = 0;
      metrics.boredomAfterCount = 0;
      metrics.engagementAfterCount = 0;
      metrics.averageEngagementStreak = 0;
    });
    this.lastMode = null;
    this.lastModeTurn = 0;
  }
}

/**
 * Global metrics tracker instance
 */
let globalMetricsTracker: ModeMetricsTracker | null = null;

/**
 * Get or create global metrics tracker
 */
export function getMetricsTracker(): ModeMetricsTracker {
  if (!globalMetricsTracker) {
    globalMetricsTracker = new ModeMetricsTracker();
  }
  return globalMetricsTracker;
}

/**
 * Reset global metrics tracker
 */
export function resetMetricsTracker(): void {
  if (globalMetricsTracker) {
    globalMetricsTracker.reset();
  }
}

