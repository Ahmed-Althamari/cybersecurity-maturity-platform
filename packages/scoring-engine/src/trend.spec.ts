import { computeTrend } from './trend';

describe('computeTrend', () => {
  it('reports flat with no change when fewer than two data points exist', () => {
    expect(computeTrend([])).toEqual({ direction: 'flat', changeFromPrevious: null, series: [] });
    expect(computeTrend([{ version: 1, current: 2.5 }])).toEqual({
      direction: 'flat',
      changeFromPrevious: null,
      series: [{ version: 1, current: 2.5 }],
    });
  });

  it('detects an upward trend between the two most recent points', () => {
    const trend = computeTrend([
      { version: 1, current: 2.0 },
      { version: 2, current: 2.8 },
    ]);
    expect(trend.direction).toBe('up');
    expect(trend.changeFromPrevious).toBe(0.8);
  });

  it('detects a downward trend', () => {
    const trend = computeTrend([
      { version: 1, current: 3.0 },
      { version: 2, current: 2.4 },
    ]);
    expect(trend.direction).toBe('down');
    expect(trend.changeFromPrevious).toBe(-0.6);
  });

  it('ignores points with no recorded score and compares the latest two that do', () => {
    const trend = computeTrend([
      { version: 1, current: 2.0 },
      { version: 2, current: null },
      { version: 3, current: 2.5 },
    ]);
    expect(trend.direction).toBe('up');
    expect(trend.changeFromPrevious).toBe(0.5);
  });

  it('reports flat for no change', () => {
    const trend = computeTrend([
      { version: 1, current: 3.0 },
      { version: 2, current: 3.0 },
    ]);
    expect(trend.direction).toBe('flat');
    expect(trend.changeFromPrevious).toBe(0);
  });
});
