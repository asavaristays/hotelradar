import { jest } from '@jest/globals';

const mockGetPerformance = jest.fn(async () => null);
const mockUpsertPerformance = jest.fn(async (payload) => ({
  hotel_id: payload.hotelId,
  direction_accuracy: payload.directionAccuracy,
  alert_precision: payload.alertPrecision,
  position_improvement_pct: payload.positionImprovementPct,
  rolling_accuracy_30d: payload.rollingAccuracy30d,
  stability_deviation: payload.stabilityDeviation,
  sample_size: payload.sampleSize,
  updated_at: new Date().toISOString(),
}));

jest.unstable_mockModule('../../src/repositories/performanceRepository.js', () => ({
  getPerformance: mockGetPerformance,
  upsertPerformance: mockUpsertPerformance,
}));

const { updatePerformanceMetrics } = await import('../../src/services/intelligence-engine/performanceEngine.js');

describe('performanceEngine', () => {
  test('updates and returns performance summary', async () => {
    const result = await updatePerformanceMetrics({
      hotelId: 'h1',
      recommendationAction: 'increase',
      competitorDirection: 'up',
      alertCount: 1,
      demandLevel: 'High',
      positionPct: -20,
      suggestedBase: 9000,
      marketAvg: 10000,
      stabilityVolatility: 28,
    });

    expect(result.directionAccuracy).toBeGreaterThan(0);
    expect(result.alertPrecision).toBeGreaterThan(0);
    expect(result.sampleSize).toBe(1);
    expect(mockUpsertPerformance).toHaveBeenCalledTimes(1);
  });
});

