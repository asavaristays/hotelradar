import { computeSeasonScore } from '../../src/services/intelligence-engine/seasonEngine.js';

describe('seasonEngine', () => {
  test('returns Goa peak season score in December', () => {
    const result = computeSeasonScore({ city: 'Goa', date: '2026-12-15T00:00:00Z' });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.neutral).toBe(false);
  });

  test('returns neutral for unknown city', () => {
    const result = computeSeasonScore({ city: 'Delhi', date: '2026-12-15T00:00:00Z' });
    expect(result.score).toBe(50);
    expect(result.neutral).toBe(true);
  });

  test('applies custom season profile monthly override', () => {
    const result = computeSeasonScore({
      city: 'Custom',
      date: '2026-01-15T00:00:00Z',
      seasonProfileMonthly: [91, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
    });
    expect(result.score).toBe(91);
    expect(result.neutral).toBe(false);
  });
});
