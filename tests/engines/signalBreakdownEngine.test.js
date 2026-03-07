import { computeSignalBreakdown } from '../../src/services/intelligence-engine/signalBreakdownEngine.js';

describe('signalBreakdownEngine', () => {
  test('splits holiday vs event impact using eventShare', () => {
    const result = computeSignalBreakdown({
      signals: {
        competitor: { score: 70 },
        holiday: { score: 80, eventShare: 0.4 },
        airfare: { score: 55 },
        season: { score: 62 },
      },
      weights: {
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      },
    });

    expect(result.holidayImpact).toBeCloseTo(4.5, 1);
    expect(result.eventImpact).toBeCloseTo(3, 1);
    expect(result.competitorMomentum).toBeCloseTo(9, 1);
    expect(result.airfareImpact).toBeCloseTo(1, 1);
    expect(result.seasonImpact).toBeCloseTo(1.2, 1);
  });
});
