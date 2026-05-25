import { jest } from '@jest/globals';
import { getCompetitorIntelligenceForUser } from '../src/services/competitorIntelligenceService.js';

describe('competitorIntelligenceService', () => {
  test('returns price positioning and top competitors for the authenticated hotel', async () => {
    const payload = await getCompetitorIntelligenceForUser(
      { hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          city: 'Goa',
        }),
        getCompetitiveGrid: async () => [
          {
            name: 'Our Hotel',
            price: 12000,
          },
          {
            name: 'Candolim Sands',
            price: 11000,
          },
          {
            name: 'Beach Crown',
            price: 13000,
          },
        ],
        listMarketHotelsByNamesAndCity: async () => [
          {
            id: 'market-1',
            hotelName: 'Candolim Sands',
            city: 'Goa',
            googleRating: 4.3,
          },
          {
            id: 'market-2',
            hotelName: 'Beach Crown',
            city: 'Goa',
            googleRating: 4.1,
          },
        ],
        listMarketHotelSignals: async () => [
          {
            hotelId: 'market-1',
            signalType: 'HIGH_REVIEW_ACTIVITY',
          },
        ],
      },
    );

    expect(payload).toEqual({
      hotel_id: 'hotel-1',
      city: 'Goa',
      your_price: 12000,
      market_median_price: 12000,
      price_position_percent: 0,
      recommended_adjustment: 'Hold current rate and monitor competitor movement closely.',
      radar_recommendation: 'You are trading close to the market median. Maintain rate and monitor pickup.',
      competitors: [
        {
          hotel_name: 'Candolim Sands',
          price: 11000,
          rating: 4.3,
          review_activity_signal: true,
        },
        {
          hotel_name: 'Beach Crown',
          price: 13000,
          rating: 4.1,
          review_activity_signal: false,
        },
      ],
    });
  });
});
