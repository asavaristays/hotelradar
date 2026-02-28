import { computeAirfareScore } from '../../src/services/intelligence-engine/airfareEngine.js';

describe('airfareEngine', () => {
  test('returns high score for strong airfare increase', () => {
    const result = computeAirfareScore({
      city: 'Goa',
      series: [
        { avg_price: 6400 },
        { avg_price: 6350 },
        { avg_price: 6300 },
        { avg_price: 6250 },
        { avg_price: 6200 },
        { avg_price: 6150 },
        { avg_price: 6100 },
        { avg_price: 5600 },
        { avg_price: 5550 },
        { avg_price: 5500 },
        { avg_price: 5450 },
        { avg_price: 5400 },
        { avg_price: 5350 },
        { avg_price: 5300 },
      ],
    });

    expect(result.score).toBeGreaterThan(60);
    expect(result.changePct).toBeGreaterThan(0);
  });

  test('falls back to neutral for missing data', () => {
    const result = computeAirfareScore({ city: 'Goa', series: [] });
    expect(result.score).toBe(50);
    expect(result.neutral).toBe(true);
  });
});
