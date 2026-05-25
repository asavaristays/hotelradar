import { getRadarScoreForUser } from '../src/services/radarScoreService.js';

describe('radarScoreService', () => {
  test('computes radar score from dashboard intelligence and market signals', async () => {
    const payload = await getRadarScoreForUser(
      { id: 'user-1', role: 'hotel_user', hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          city: 'Goa',
          hotel_name: 'Seabreeze Goa',
        }),
        getDashboard: async () => ({
          demandLevel: 'High',
          confidence: { score: 82 },
          marketPosition: { positionPct: -6 },
          lastUpdated: '2026-03-15',
        }),
        listMarketHotelsByNamesAndCity: async () => [
          {
            id: 'market-1',
            hotelName: 'Seabreeze Goa',
          },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'market-1', signalType: 'HIGH_REVIEW_ACTIVITY' },
          { hotelId: 'market-1', signalType: 'CHATBOT_GAP' },
        ],
      },
    );

    expect(payload).toEqual({
      hotel_id: 'hotel-1',
      city: 'Goa',
      radar_score: 77,
      components: {
        pricing_alignment: 87,
        review_strength: 80,
        demand_alignment: 79,
        ota_dependence: 78,
        direct_booking: 54,
      },
      generated_at: '2026-03-15',
    });
  });
});
