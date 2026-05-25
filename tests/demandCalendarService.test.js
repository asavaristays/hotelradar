import { getDemandCalendar } from '../src/services/demandCalendarService.js';

describe('demandCalendarService', () => {
  test('returns chronological demand events when matching city signals are active', async () => {
    const payload = await getDemandCalendar(
      { horizonDays: 30, hours: 72 },
      {
        listRecentMarketHotelSignalsForFeed: async () => [
          {
            city: 'Goa',
            signalType: 'festival_demand',
            signalStrength: 2.5,
          },
          {
            city: 'Goa',
            signalType: 'festival_demand',
            signalStrength: 2.0,
          },
          {
            city: 'Mumbai',
            signalType: 'corporate_event_cluster',
            signalStrength: 1.8,
          },
        ],
        listUpcomingEventsByCity: async (city) => {
          if (city === 'Goa') {
            return [
              {
                city: 'Goa',
                event_name: 'Goa Music Festival',
                start_date: '2026-03-18',
                end_date: '2026-03-20',
                category: 'festival',
                impact_score: 16,
              },
            ];
          }

          if (city === 'Mumbai') {
            return [
              {
                city: 'Mumbai',
                event_name: 'Mumbai Business Summit',
                start_date: '2026-03-22',
                end_date: '2026-03-23',
                category: 'corporate conference',
                impact_score: 14,
              },
            ];
          }

          return [];
        },
      },
    );

    expect(payload).toEqual({
      events: [
        {
          city: 'Goa',
          event_type: 'festival',
          event_name: 'Goa Music Festival',
          start_date: '2026-03-18',
          end_date: '2026-03-20',
          expected_demand_increase: 34,
          signal_source: 'festival_demand',
        },
        {
          city: 'Mumbai',
          event_type: 'corporate',
          event_name: 'Mumbai Business Summit',
          start_date: '2026-03-22',
          end_date: '2026-03-23',
          expected_demand_increase: 28,
          signal_source: 'corporate_event_cluster',
        },
      ],
    });
  });
});
