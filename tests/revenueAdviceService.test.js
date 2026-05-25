import { getRevenueAdviceForUser } from '../src/services/revenueAdviceService.js';

describe('revenueAdviceService', () => {
  test('returns daily revenue advice from existing dashboard intelligence', async () => {
    const payload = await getRevenueAdviceForUser(
      { id: 'user-1', role: 'hotel_user', hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          city: 'Goa',
        }),
        getDashboard: async () => ({
          demandLevel: 'High',
          marketPosition: {
            hotelPrice: 12000,
          },
          suggestedPricing: {
            base: 13200,
            riskLevel: 'Medium',
          },
          confidence: {
            score: 86,
          },
          revenueImpact: {
            maintain: 850000,
            plus2: 910000,
            recommended: 'plus2',
          },
          lastUpdated: '2026-03-14T10:15:00.000Z',
        }),
      },
    );

    expect(payload).toEqual({
      hotel_id: 'hotel-1',
      city: 'Goa',
      market_demand: 'High',
      current_price: 12000,
      suggested_price: 13200,
      confidence_score: 86,
      risk_level: 'Medium',
      expected_revenue_gain: 60000,
      generated_at: '2026-03-14T10:15:00.000Z',
      verification: {
        status: 'verified',
        label: 'Checked twice before display',
        pass_count: 4,
        checks: [
          { key: 'hotel_context', label: 'Hotel context', passed: true },
          { key: 'pricing_snapshot', label: 'Pricing snapshot', passed: true },
          { key: 'confidence_score', label: 'Confidence score', passed: true },
          { key: 'revenue_impact', label: 'Revenue impact', passed: true },
        ],
        checked_at: expect.any(String),
      },
    });
  });
});
