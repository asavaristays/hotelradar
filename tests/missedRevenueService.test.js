import { getMissedRevenueForUser } from '../src/services/missedRevenueService.js';

describe('missedRevenueService', () => {
  test('estimates missed revenue from rate gap, rooms, and occupancy proxy', async () => {
    const payload = await getMissedRevenueForUser(
      { id: 'user-1', role: 'hotel_user', hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          city: 'Goa',
          room_count: 20,
        }),
        getDashboard: async () => ({
          marketPosition: {
            hotelPrice: 6900,
            marketAvg: 8200,
          },
        }),
        getCompetitiveGrid: async () => [
          { name: 'Our Hotel', price: 6900, occupancyProxy: 85 },
          { name: 'Comp A', price: 8000, occupancyProxy: 84 },
          { name: 'Comp B', price: 8400, occupancyProxy: 86 },
        ],
      },
    );

    expect(payload).toEqual({
      hotel_id: 'hotel-1',
      city: 'Goa',
      period: 'last_weekend',
      your_avg_price: 6900,
      market_avg_price: 8200,
      rooms_available: 20,
      occupancy_estimate: 0.85,
      estimated_missed_revenue: 44200,
    });
  });
});
