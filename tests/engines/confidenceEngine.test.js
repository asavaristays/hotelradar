import { computeDemandConfidence } from '../../src/services/intelligence-engine/confidenceEngine.js';

describe('confidenceEngine', () => {
  test('applies confidence bias from calibration', () => {
    const baseInput = {
      competitorRates: [
        { price_today: 12000, price_48h_ago: 11000, scraped_at: new Date().toISOString() },
        { price_today: 11800, price_48h_ago: 10900, scraped_at: new Date().toISOString() },
      ],
      airfareSeries: Array.from({ length: 14 }).map((_, i) => ({ avg_price: 5000 + i * 10 })),
      holidays: [{ holiday_date: '2026-03-01', holiday_name: 'Festival', holiday_type: 'public' }],
      signals: {
        competitor: { score: 68 },
        holiday: { score: 72 },
        airfare: { score: 55 },
        season: { score: 64 },
      },
    };

    const neutral = computeDemandConfidence({ ...baseInput, calibration: { global: { confidence: { defaultBias: 0 } } } });
    const boosted = computeDemandConfidence({ ...baseInput, calibration: { global: { confidence: { defaultBias: 5, ceiling: 99, min: 45 } } } });

    expect(boosted.score).toBeGreaterThanOrEqual(neutral.score);
  });
});

