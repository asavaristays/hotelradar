import { computeCompetitorScore } from '../../src/services/intelligence-engine/competitorEngine.js';

describe('competitorEngine', () => {
  test('returns up direction when smoothed change is above threshold', () => {
    const result = computeCompetitorScore([
      { id: 'a', price_today: 120, price_48h_ago: 100, price_7d_ago: 95 },
      { id: 'b', price_today: 110, price_48h_ago: 100, price_7d_ago: 98 },
    ]);

    expect(result.direction).toBe('up');
    expect(result.score).toBeGreaterThan(50);
    expect(result.neutral).toBe(false);
  });

  test('filters outliers above ±30% movement', () => {
    const result = computeCompetitorScore([
      { id: 'a', price_today: 120, price_48h_ago: 100, price_7d_ago: 98 },
      { id: 'b', price_today: 210, price_48h_ago: 100, price_7d_ago: 95 },
    ]);

    expect(result.outlierCount).toBeGreaterThanOrEqual(1);
  });

  test('handles zero movement as stable', () => {
    const result = computeCompetitorScore([
      { id: 'a', price_today: 100, price_48h_ago: 100, price_7d_ago: 100 },
      { id: 'b', price_today: 100, price_48h_ago: 100, price_7d_ago: 100 },
    ]);

    expect(result.direction).toBe('stable');
    expect(result.avgChangePct).toBe(0);
  });

  test('falls back to neutral when data missing', () => {
    const result = computeCompetitorScore([]);
    expect(result.score).toBe(50);
    expect(result.neutral).toBe(true);
  });
});
