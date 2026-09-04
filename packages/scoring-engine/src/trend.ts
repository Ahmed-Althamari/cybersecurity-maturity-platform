import type { Trend, TrendPoint } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compares the two most recent points in a maturity history (e.g. from
 * `AssessmentHistory` versions) and reports direction + change. `points`
 * is expected oldest-first; a `current` of `null` (no score recorded yet
 * at that version) is treated as having no data to compare.
 */
export function computeTrend(points: TrendPoint[]): Trend {
  const withData = points.filter((point) => point.current !== null);
  const latest = withData[withData.length - 1];
  const previous = withData[withData.length - 2];

  if (!latest || !previous) {
    return { direction: 'flat', changeFromPrevious: null, series: points };
  }

  const change = round2((latest.current as number) - (previous.current as number));
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return { direction, changeFromPrevious: change, series: points };
}
