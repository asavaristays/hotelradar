import { jest } from '@jest/globals';
import {
  buildMarketOpportunityNotifications,
  runMarketOpportunityNotificationEngine,
} from '../src/services/lead-radar/marketOpportunityNotificationService.js';

describe('marketOpportunityNotificationService', () => {
  test('buildMarketOpportunityNotifications creates nearby notifications for strong opportunities and caps per hotel per day', () => {
    const opportunities = [
      {
        city: 'Goa',
        hotelId: 'source-1',
        signalType: 'DEMAND_SURGE_CLUSTER',
        score: 6,
        createdAt: new Date('2026-03-14T09:00:00.000Z'),
      },
      {
        city: 'Goa',
        hotelId: 'source-2',
        signalType: 'CHATBOT_GAP',
        score: 3,
        createdAt: new Date('2026-03-14T10:00:00.000Z'),
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        city: 'Jaipur',
        hotelId: `source-${index}`,
        signalType: 'TOURISM_SPIKE',
        score: 5,
        createdAt: new Date(`2026-03-14T${String(index % 10).padStart(2, '0')}:00:00.000Z`),
      })),
    ];
    const neighbors = [
      { hotelId: 'source-1', neighborHotelId: 'target-1', distanceKm: 1.2 },
      { hotelId: 'source-1', neighborHotelId: 'target-2', distanceKm: 4.5 },
      { hotelId: 'source-2', neighborHotelId: 'target-1', distanceKm: 2.2 },
      ...Array.from({ length: 12 }, (_, index) => ({
        hotelId: `source-${index}`,
        neighborHotelId: 'crowded-target',
        distanceKm: 1.1,
      })),
    ];

    const result = buildMarketOpportunityNotifications(opportunities, neighbors, {
      maxDistanceKm: 5,
      minOpportunityScore: 4,
      maxPerHotelPerDay: 10,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        {
          hotelId: 'target-1',
          signalType: 'DEMAND_SURGE_CLUSTER',
          opportunityScore: 6,
          createdAt: new Date('2026-03-14T09:00:00.000Z'),
        },
        {
          hotelId: 'target-2',
          signalType: 'DEMAND_SURGE_CLUSTER',
          opportunityScore: 6,
          createdAt: new Date('2026-03-14T09:00:00.000Z'),
        },
      ]),
    );
    expect(result.some((row) => row.signalType === 'CHATBOT_GAP')).toBe(false);
    expect(result.filter((row) => row.hotelId === 'crowded-target')).toHaveLength(10);
  });

  test('runMarketOpportunityNotificationEngine rebuilds notifications', async () => {
    const replaceMarketOpportunityNotifications = jest.fn(async (rows) => ({
      rowCount: rows.length,
    }));

    const summary = await runMarketOpportunityNotificationEngine(
      { city: 'Mumbai', batchSize: 120, maxDistanceKm: 5, minOpportunityScore: 4 },
      {
        listMarketRankedOpportunities: async () => [
          {
            city: 'Mumbai',
            hotelId: 'source-1',
            signalType: 'WEEKEND_COMPRESSION',
            score: 5,
            createdAt: new Date('2026-03-14T09:00:00.000Z'),
          },
        ],
        listMarketHotelNeighbors: async () => [
          { hotelId: 'source-1', neighborHotelId: 'target-1', distanceKm: 1.5 },
        ],
        replaceMarketOpportunityNotifications,
      },
    );

    expect(replaceMarketOpportunityNotifications).toHaveBeenCalledWith(
      [
        {
          hotelId: 'target-1',
          signalType: 'WEEKEND_COMPRESSION',
          opportunityScore: 5,
          createdAt: new Date('2026-03-14T09:00:00.000Z'),
        },
      ],
      { batchSize: 120 },
    );
    expect(summary.notificationsCreated).toBe(1);
  });
});
