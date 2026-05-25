import { getDirectBookingOpportunityForUser } from '../src/services/directBookingOpportunityService.js';

describe('directBookingOpportunityService', () => {
  test('estimates lost direct revenue using OTA dependence and conversion gap signals', async () => {
    const payload = await getDirectBookingOpportunityForUser(
      { id: 'user-1', role: 'hotel_user', hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          hotel_name: 'Candolim Sands',
          city: 'Goa',
          room_count: 20,
        }),
        getDashboard: async () => ({
          demandLevel: 'High',
          marketPosition: {
            hotelPrice: 6800,
          },
          suggestedPricing: {
            base: 7200,
          },
        }),
        listMarketHotelsByNamesAndCity: async () => [
          {
            id: 'market-1',
            hotelName: 'Candolim Sands',
          },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'market-1', signalType: 'OTA_DEPENDENCE' },
          { hotelId: 'market-1', signalType: 'CHATBOT_GAP' },
          { hotelId: 'market-1', signalType: 'HIGH_REVIEW_ACTIVITY' },
        ],
      },
    );

    expect(payload).toEqual({
      hotel_id: 'hotel-1',
      city: 'Goa',
      ota_dependence_percent: 92,
      estimated_monthly_revenue: 3182400,
      estimated_lost_direct_revenue: 907620,
      suggested_action: 'Improve direct booking funnel and deploy chatbot-led conversion',
      confidence: 0.87,
    });
  });
});
