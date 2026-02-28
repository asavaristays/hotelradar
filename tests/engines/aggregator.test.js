import { aggregateDemand } from '../../src/services/intelligence-engine/aggregator.js';

describe('aggregator', () => {
  test('aggregates weighted score and recommendation', () => {
    const result = aggregateDemand({
      city: 'Goa',
      weights: {
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      },
      signals: {
        competitor: { score: 80, confidence: 90, reason: 'Competitor up.' },
        holiday: { score: 70, confidence: 85, reason: 'Holiday near.' },
        airfare: { score: 60, confidence: 88, reason: 'Airfare rising.' },
        season: { score: 75, confidence: 92, reason: 'Season strong.' },
      },
    });

    expect(result.demandScore).toBeCloseTo(73, 0);
    expect(result.level).toBe('High');
    expect(result.recommendation.action).toBe('increase');
    expect(Array.isArray(result.explanation)).toBe(true);
    expect(result.explanation.length).toBe(4);
  });
});
