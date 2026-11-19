export type RetryDecision = { action: 'retry'; delayMs: number } | { action: 'dead' };

/**
 * failures = عدد المحاولات الفاشلة بما فيها الحالية، delays = [30000, 90000]
 *   فشل 1 => retry بعد 30 ثانية
 *   فشل 2 => retry بعد 90 ثانية
 *   فشل 3 => Dead-Letter Queue
 */
export function decideRetry(failures: number, delays: readonly number[]): RetryDecision {
  if (failures >= 1 && failures <= delays.length) return { action: 'retry', delayMs: delays[failures - 1] };
  return { action: 'dead' };
}