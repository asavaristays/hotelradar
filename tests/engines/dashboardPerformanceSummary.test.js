import { getPerformanceSummary } from '../../src/services/dashboardService.js';

describe('dashboard performance summary validation mode', () => {
  test('uses validated outcomes when available', async () => {
    const summary = await getPerformanceSummary('h1', {
      getPerformance: async () => ({
        direction_accuracy: 99,
        alert_precision: 82,
        position_improvement_pct: 6,
        rolling_accuracy_30d: 97,
        stability_deviation: 11,
        sample_size: 50,
        updated_at: '2026-03-01T00:00:00.000Z',
      }),
      getValidatedPerformance: async () => ({
        directionAccuracy: 64,
        rollingAccuracy30d: 64,
        stabilityDeviation: 18.2,
        sampleSize: 9,
        directionSamples: 8,
        updatedAt: '2026-03-06T00:00:00.000Z',
        source: 'validated_outcomes',
      }),
    });

    expect(summary.directionAccuracy).toBe(64);
    expect(summary.rollingAccuracy30d).toBe(64);
    expect(summary.stabilityDeviation).toBe(18.2);
    expect(summary.sampleSize).toBe(9);
    expect(summary.alertPrecision).toBe(82);
    expect(summary.source).toBe('validated_outcomes');
  });

  test('suppresses forecast accuracy claims when no validated outcomes exist', async () => {
    const summary = await getPerformanceSummary('h1', {
      getPerformance: async () => ({
        direction_accuracy: 91,
        alert_precision: 80,
        position_improvement_pct: 5,
        rolling_accuracy_30d: 90,
        stability_deviation: 9,
        sample_size: 40,
        updated_at: '2026-03-01T00:00:00.000Z',
      }),
      getValidatedPerformance: async () => null,
    });

    expect(summary.directionAccuracy).toBe(0);
    expect(summary.rollingAccuracy30d).toBe(0);
    expect(summary.stabilityDeviation).toBe(0);
    expect(summary.sampleSize).toBe(0);
    expect(summary.alertPrecision).toBe(80);
    expect(summary.source).toBe('no_validated_outcomes');
  });
});
