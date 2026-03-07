import { computePricingRecommendation } from '../../src/services/intelligence-engine/pricingEngine.js';

describe('pricingEngine', () => {
  test('Moderate demand + 30% underpricing', () => {
    const result = computePricingRecommendation({
      demandScore: 61,
      demandLevel: 'Moderate',
      hotelPrice: 7000,
      marketAvgPrice: 10000,
      competitorMomentum: { score: 70, avgChangePct: 8, direction: 'up' },
      holidayScore: 60,
      airfareScore: 55,
      city: 'Goa',
    });

    expect(result.base).toBe(8200);
    expect(result.action).toBe('increase');
    expect(result.bands.safe.min).toBeLessThan(result.bands.safe.max);
    expect(['Low', 'Medium']).toContain(result.riskLevel);
  });

  test('Low demand + overpriced', () => {
    const result = computePricingRecommendation({
      demandScore: 35,
      demandLevel: 'Low',
      hotelPrice: 12000,
      marketAvgPrice: 10000,
      competitorMomentum: { score: 40, avgChangePct: -4, direction: 'down' },
      holidayScore: 35,
      airfareScore: 40,
      city: 'Mumbai',
    });

    expect(result.action).toBe('reduce');
    expect(result.base).toBe(11650);
    expect(['Medium', 'High']).toContain(result.riskLevel);
  });

  test('Surge + underpriced', () => {
    const result = computePricingRecommendation({
      demandScore: 90,
      demandLevel: 'Surge',
      hotelPrice: 9000,
      marketAvgPrice: 12000,
      competitorMomentum: { score: 92, avgChangePct: 18, direction: 'up' },
      holidayScore: 88,
      airfareScore: 82,
      city: 'Goa',
    });

    expect(result.action).toBe('increase');
    expect(result.base).toBe(11400);
    expect(result.marketHeat).toBe(5);
  });

  test('Stable market', () => {
    const result = computePricingRecommendation({
      demandScore: 58,
      demandLevel: 'Moderate',
      hotelPrice: 10000,
      marketAvgPrice: 10200,
      competitorMomentum: { score: 50, avgChangePct: 0, direction: 'stable' },
      holidayScore: 50,
      airfareScore: 50,
      city: 'Mumbai',
    });

    expect(result.marketHeat).toBe(3);
    expect(result.bands.aggressive.min).toBeGreaterThanOrEqual(result.bands.safe.min);
  });

  test('Moderate demand + strong overpricing suggests reduction', () => {
    const result = computePricingRecommendation({
      demandScore: 60,
      demandLevel: 'Moderate',
      hotelPrice: 30000,
      marketAvgPrice: 14000,
      competitorMomentum: { score: 56, avgChangePct: 3, direction: 'stable' },
      holidayScore: 62,
      airfareScore: 50,
      city: 'Pushkar',
    });

    expect(result.action).toBe('reduce');
    expect(result.base).toBeLessThan(30000);
    expect(['Medium', 'High']).toContain(result.riskLevel);
  });

  test('bands stay ordered without overlap when competitor signal is unavailable', () => {
    const result = computePricingRecommendation({
      demandScore: 58,
      demandLevel: 'Moderate',
      hotelPrice: 10500,
      marketAvgPrice: 0,
      competitorMomentum: { score: 50, avgChangePct: 0, direction: 'stable' },
      holidayScore: 52,
      airfareScore: 48,
      city: 'Goa',
    });

    expect(result.bands.safe.max).toBeLessThanOrEqual(result.bands.aggressive.min);
    expect(result.bands.aggressive.max).toBeLessThanOrEqual(result.bands.premium.min);
  });
});
