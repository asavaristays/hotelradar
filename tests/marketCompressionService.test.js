import { getMarketCompressionForUser } from '../src/services/marketCompressionService.js';

describe('marketCompressionService', () => {
  test('computes compression level and sellout window from active market signals', async () => {
    const payload = await getMarketCompressionForUser(
      { hotels: ['hotel-1'] },
      { signalHours: 72, horizonDays: 7 },
      {
        getHotelById: async () => ({ id: 'hotel-1', city: 'Goa' }),
        listRecentMarketHotelSignalsForFeed: async () => [
          { city: 'Goa', signalType: 'weekend_compression', signalStrength: 4 },
          { city: 'Goa', signalType: 'demand_surge_cluster', signalStrength: 3 },
          { city: 'Goa', signalType: 'event_demand_zone', signalStrength: 2 },
          { city: 'Goa', signalType: 'tourism_spike', signalStrength: 3 },
        ],
        getDemandCalendar: async () => ({
          events: [
            {
              city: 'Goa',
              event_type: 'festival',
              event_name: 'Goa Weekend Fest',
              start_date: '2026-03-14',
              end_date: '2026-03-15',
              expected_demand_increase: 36,
              signal_source: 'festival_demand',
            },
          ],
        }),
      },
    );

    expect(payload).toEqual({
      city: 'Goa',
      compression_level: 'high',
      expected_sellout_window: '24 hours',
      recommended_action: 'Increase prices immediately',
      confidence: 0.94,
    });
  });
});
