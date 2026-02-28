import { normalizeCompetitorRates } from '../../src/services/intelligence-engine/rateNormalizationEngine.js';
import { computeMarketConfidenceIndex } from '../../src/services/intelligence-engine/marketConfidenceEngine.js';
import { analyzeHotelPositioning } from '../../src/services/intelligence-engine/positioningAnalysisEngine.js';

describe('market intelligence engines', () => {
  test('normalizes BAR rates, removes tax, and flags outliers', () => {
    const rows = [
      {
        hotel_name: 'Hotel A',
        date: '2026-02-25',
        room_category: 'Deluxe',
        source: 'booking',
        cancellation_type: 'Free cancellation',
        list_of_rates: [
          { rate: 12000, includes_tax: true, tax_percent: 12, rate_type: 'BAR' },
          { rate: 20000, includes_tax: false, rate_type: 'BAR' },
        ],
      },
      {
        hotel_name: 'Hotel A',
        date: '2026-02-25',
        room_category: 'Deluxe',
        source: 'agoda',
        cancellation_type: 'Free cancellation',
        list_of_rates: [{ rate: 11800, includes_tax: true, tax_amount: 1000, rate_type: 'BAR' }],
      },
      {
        hotel_name: 'Hotel A',
        date: '2026-02-25',
        room_category: 'Deluxe',
        source: 'expedia',
        cancellation_type: 'Free cancellation',
        list_of_rates: [{ rate: 9000, includes_tax: false, rate_type: 'Package' }],
      },
    ];

    const output = normalizeCompetitorRates(rows);
    expect(output).toHaveLength(1);
    expect(output[0]).toEqual({
      hotel: 'Hotel A',
      date: '2026-02-25',
      room_type: 'Deluxe',
      normalized_rate: 10757,
      source_count: 2,
      outlier_flag: true,
    });
  });

  test('computes market confidence index', () => {
    const result = computeMarketConfidenceIndex({
      date: '2026-02-25',
      normalized_rate: 10757,
      source_count: 3,
      consistency_score: 80,
      cancellation_match: 1,
      freshness_hours: 12,
    });

    expect(result.date).toBe('2026-02-25');
    expect(result.market_confidence).toBe('Medium');
    expect(result.confidence_score).toBe(76.75);
  });

  test('computes confidence-smoothed hotel positioning and anomalies', () => {
    const output = analyzeHotelPositioning({
      hotel: 'Hotel A',
      hotelRates: [
        { date: '2026-01-10', rate: 100 },
        { date: '2026-02-10', rate: 140 },
        { date: '2026-03-10', rate: 110 },
      ],
      competitorNormalizedRates: [
        { date: '2026-01-10', normalized_rate: 100 },
        { date: '2026-02-10', normalized_rate: 100 },
        { date: '2026-03-10', normalized_rate: 100 },
      ],
      marketConfidenceIndex: [
        { date: '2026-01-10', market_confidence: 'High', confidence_score: 90 },
        { date: '2026-02-10', market_confidence: 'Low', confidence_score: 40 },
        { date: '2026-03-10', market_confidence: 'Medium', confidence_score: 70 },
      ],
    });

    expect(output.hotel).toBe('Hotel A');
    expect(output.date_range).toBe('2026-01-10 to 2026-03-10');
    expect(output.position_percent).toBe(13);
    expect(output.confidence).toBe('Medium');
    expect(output.recommendation).toContain('Near market median');
    expect(Array.isArray(output.quarterly_trend)).toBe(true);
    expect(output.anomalies.length).toBeGreaterThan(0);
  });
});
