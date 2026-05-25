import { getMarketPositionIntelligenceForUser } from '../src/services/marketPositionIntelligenceService.js';

describe('marketPositionIntelligenceService', () => {
  test('returns current market position and optimal adjustment for the authenticated hotel', async () => {
    const payload = await getMarketPositionIntelligenceForUser(
      { id: 'user-1', role: 'hotel_user', hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          city: 'Goa',
        }),
        getDashboard: async () => ({
          marketPosition: {
            hotelPrice: 7800,
            marketAvg: 8450,
          },
          suggestedPricing: {
            base: 8950,
          },
        }),
        getCompetitiveGrid: async () => [
          { name: 'Our Hotel', price: 7800 },
          { name: 'Comp A', price: 8200 },
          { name: 'Comp B', price: 8700 },
        ],
      },
    );

    expect(payload).toEqual({
      hotel_id: 'hotel-1',
      city: 'Goa',
      current_price: 7800,
      market_median_price: 8450,
      position_percent: -8,
      optimal_price: 8950,
      suggested_adjustment: 1150,
    });
  });
});
