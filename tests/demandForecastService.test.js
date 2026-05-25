import { getDemandForecastForUser } from '../src/services/demandForecastService.js';

describe('demandForecastService', () => {
  test('returns a 7-day demand forecast using signal mix and upcoming demand events', async () => {
    const payload = await getDemandForecastForUser(
      { hotels: ['hotel-1'] },
      { horizonDays: 3, signalHours: 72 },
      {
        getHotelById: async () => ({ id: 'hotel-1', city: 'Goa' }),
        listRecentMarketHotelSignalsForFeed: async () => [
          {
            city: 'Goa',
            signalType: 'festival_demand',
            signalStrength: 2,
          },
          {
            city: 'Goa',
            signalType: 'weekend_compression',
            signalStrength: 3,
          },
          {
            city: 'Goa',
            signalType: 'tourism_spike',
            signalStrength: 1,
          },
        ],
        getDemandCalendar: async () => ({
          events: [
            {
              city: 'Goa',
              event_type: 'festival',
              event_name: 'Goa Festival',
              start_date: '2026-03-14',
              end_date: '2026-03-15',
              expected_demand_increase: 30,
              signal_source: 'festival_demand',
            },
          ],
        }),
      },
    );

    expect(payload.city).toBe('Goa');
    expect(payload.forecast).toHaveLength(3);
    expect(payload.forecast[0]).toHaveProperty('date');
    expect(payload.forecast[0]).toHaveProperty('demand_score');
    expect(payload.forecast[0]).toHaveProperty('demand_level');
    expect(payload.forecast.every((entry) => entry.demand_score >= 0 && entry.demand_score <= 100)).toBe(true);
  });

  test('does not saturate all forecast days to 100 when many strong signals are present', async () => {
    const payload = await getDemandForecastForUser(
      { hotels: ['hotel-2'] },
      { horizonDays: 3, signalHours: 72 },
      {
        getHotelById: async () => ({ id: 'hotel-2', city: 'Mumbai' }),
        listRecentMarketHotelSignalsForFeed: async () => [
          { city: 'Mumbai', signalType: 'festival_demand', signalStrength: 5 },
          { city: 'Mumbai', signalType: 'event_demand_zone', signalStrength: 5 },
          { city: 'Mumbai', signalType: 'corporate_event_cluster', signalStrength: 5 },
          { city: 'Mumbai', signalType: 'tourism_spike', signalStrength: 5 },
          { city: 'Mumbai', signalType: 'airport_demand', signalStrength: 5 },
          { city: 'Mumbai', signalType: 'weekend_compression', signalStrength: 5 },
        ],
        getDemandCalendar: async () => ({
          events: [],
        }),
      },
    );

    expect(payload.forecast).toHaveLength(3);
    expect(payload.forecast.every((entry) => entry.demand_score < 100)).toBe(true);
  });
});
