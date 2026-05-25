import { getIntelligenceAlertsForUser } from '../src/services/intelligenceAlertsService.js';

describe('getIntelligenceAlertsForUser', () => {
  test('maps recent city signals into sorted alert cards', async () => {
    const payload = await getIntelligenceAlertsForUser(
      { hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({ id: 'hotel-1', city: 'Goa' }),
        listRecentMarketHotelSignalsForFeed: async () => [
          {
            city: 'Goa',
            signalType: 'WEEKEND_COMPRESSION',
            createdAt: '2026-03-14T09:00:00.000Z',
            signalStrength: 6,
          },
          {
            city: 'Goa',
            signalType: 'DEMAND_SURGE_CLUSTER',
            createdAt: '2026-03-14T10:00:00.000Z',
            signalStrength: 4,
          },
          {
            city: 'Goa',
            signalType: 'DEMAND_SURGE_CLUSTER',
            createdAt: '2026-03-14T08:00:00.000Z',
            signalStrength: 3,
          },
        ],
      },
    );

    expect(payload).toEqual({
      alerts: [
        {
          alert_type: 'demand_surge',
          city: 'Goa',
          signal_source: 'demand_surge_cluster',
          message: 'Demand surge detected in Goa market cluster.',
          recommended_action: 'Increase weekend prices',
          created_at: '2026-03-14T10:00:00.000Z',
          severity: 'high',
        },
        {
          alert_type: 'weekend_compression',
          city: 'Goa',
          signal_source: 'weekend_compression',
          message: 'Weekend compression is rising across Goa.',
          recommended_action: 'Tighten discounting and test higher weekend rates',
          created_at: '2026-03-14T09:00:00.000Z',
          severity: 'high',
        },
      ],
    });
  });

  test('fails cleanly when user has no hotel context', async () => {
    await expect(getIntelligenceAlertsForUser({ hotels: [] })).rejects.toMatchObject({
      status: 400,
      message: 'Hotel context is required for intelligence alerts.',
    });
  });
});
