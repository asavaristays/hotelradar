import {
  computeForecastAccuracy,
  logDailyForecast,
} from '../../src/services/forecastAccuracyTracker.js';

describe('forecastAccuracyTracker', () => {
  test('computes rolling accuracy and average error from historical entries', () => {
    const history = [
      {
        date: '2026-02-24',
        predicted: { positionPercent: -10, demandPeak: true, volatilityScore: 30 },
        actual: { positionPercent: -12, demandPeak: true, volatilityScore: 34 },
      },
      {
        date: '2026-02-25',
        predicted: { positionPercent: -8, demandPeak: false, volatilityScore: 38 },
        actual: { positionPercent: -1, demandPeak: false, volatilityScore: 45 },
      },
      {
        date: '2026-02-26',
        predicted: { positionPercent: -6, demandPeak: true, volatilityScore: 42 },
        actual: { positionPercent: 8, demandPeak: false, volatilityScore: 60 },
      },
    ];

    const output = computeForecastAccuracy(history, { forecastPeriod: 'rolling_7d' });

    expect(output.forecastPeriod).toBe('rolling_7d');
    expect(output.accuracyPercentage).toBeCloseTo(66.67, 2);
    expect(output.averageError).toBeCloseTo(13.5, 1);
  });

  test('logs a daily forecast entry in normalized form', () => {
    const output = logDailyForecast([], {
      date: '2026-02-27',
      predicted: { positionPercent: -9, demandPeak: 1, volatilityScore: 40 },
      actual: { positionPercent: -6, demandPeak: 0, volatilityScore: 48 },
    });

    expect(output).toHaveLength(1);
    expect(output[0]).toHaveProperty('date', '2026-02-27');
    expect(output[0]).toHaveProperty('predicted.positionPercent', -9);
  });
});
