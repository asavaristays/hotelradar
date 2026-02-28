import { computeCompression } from '../../src/services/intelligence-engine/compressionEngine.js';

describe('compressionEngine', () => {
  test('computes high compression on scarce inventory', () => {
    const result = computeCompression({
      competitorRates: [
        { price_today: 12000 },
        { price_today: 12300 },
        { price_today: 12600 },
        { price_today: 12900 },
      ],
      marketPosition: { hotelPrice: 13800, marketAvg: 11000, positionPct: 25.45 },
      calibration: {
        compression: {
          thresholds: {
            lowMax: 45,
            moderateMax: 70,
            priceVacuumPct: 12,
            opportunityMinFactor: 0.95,
            opportunityMaxFactor: 1.05,
          },
        },
      },
    });

    expect(result.scarcityScore).toBeGreaterThan(70);
    expect(result.compressionLevel).toBe('High');
    expect(typeof result.priceVacuumDetected).toBe('boolean');
    expect(result.opportunityBand.min).toBeLessThan(result.opportunityBand.max);
  });

  test('returns neutral compression for missing competitor data', () => {
    const result = computeCompression({
      competitorRates: [],
      marketPosition: { hotelPrice: 0, marketAvg: 0, positionPct: 0 },
      calibration: {},
    });

    expect(result.compressionLevel).toBe('Moderate');
    expect(result.scarcityScore).toBe(50);
  });
});
