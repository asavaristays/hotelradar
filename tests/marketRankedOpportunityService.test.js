import { jest } from '@jest/globals';
import {
  buildMarketRankedOpportunities,
  runMarketRankedOpportunityEngine,
} from '../src/services/lead-radar/marketRankedOpportunityService.js';

describe('marketRankedOpportunityService', () => {
  test('buildMarketRankedOpportunities applies weights and keeps top 100 per city', () => {
    const feedEntries = [
      {
        city: 'Goa',
        signalType: 'DEMAND_SURGE_CLUSTER',
        hotelId: 'hotel-high',
        signalStrength: 3,
        createdAt: new Date('2026-03-14T10:00:00.000Z'),
      },
      {
        city: 'Goa',
        signalType: 'CHATBOT_GAP',
        hotelId: 'hotel-low',
        signalStrength: 4,
        createdAt: new Date('2026-03-14T11:00:00.000Z'),
      },
      {
        city: 'Mumbai',
        signalType: 'UNKNOWN',
        hotelId: 'hotel-ignore',
        signalStrength: 9,
        createdAt: new Date('2026-03-14T09:00:00.000Z'),
      },
      ...Array.from({ length: 105 }, (_, index) => ({
        city: 'Jaipur',
        signalType: 'HIGH_REVIEW_ACTIVITY',
        hotelId: `hotel-${index.toString().padStart(3, '0')}`,
        signalStrength: 2 + (105 - index) / 100,
        createdAt: new Date(Date.parse('2026-03-14T12:00:00.000Z') - index * 60_000),
      })),
    ];

    const result = buildMarketRankedOpportunities(feedEntries, { perCityLimit: 100 });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Goa',
          hotelId: 'hotel-high',
          signalType: 'DEMAND_SURGE_CLUSTER',
          score: 15,
        }),
        expect.objectContaining({
          city: 'Goa',
          hotelId: 'hotel-low',
          signalType: 'CHATBOT_GAP',
          score: 8,
        }),
      ]),
    );
    expect(result.some((row) => row.hotelId === 'hotel-ignore')).toBe(false);
    expect(result.filter((row) => row.city === 'Jaipur')).toHaveLength(100);
    expect(result.find((row) => row.city === 'Jaipur')).toEqual(
      expect.objectContaining({ hotelId: 'hotel-000' }),
    );
  });

  test('runMarketRankedOpportunityEngine rebuilds ranked opportunities from feed entries', async () => {
    const replaceMarketRankedOpportunities = jest.fn(async (rows) => ({
      rowCount: rows.length,
    }));

    const summary = await runMarketRankedOpportunityEngine(
      { city: 'Mumbai', batchSize: 120, perCityLimit: 100 },
      {
        listMarketOpportunityFeed: async () => [
          {
            city: 'Mumbai',
            signalType: 'TOURISM_SPIKE',
            hotelId: 'hotel-1',
            signalStrength: 2,
            createdAt: new Date('2026-03-14T10:00:00.000Z'),
          },
          {
            city: 'Mumbai',
            signalType: 'CHATBOT_GAP',
            hotelId: 'hotel-2',
            signalStrength: 5,
            createdAt: new Date('2026-03-14T09:00:00.000Z'),
          },
        ],
        replaceMarketRankedOpportunities,
      },
    );

    expect(replaceMarketRankedOpportunities).toHaveBeenCalledWith(
      [
        {
          city: 'Mumbai',
          hotelId: 'hotel-2',
          signalType: 'CHATBOT_GAP',
          score: 10,
          createdAt: new Date('2026-03-14T09:00:00.000Z'),
        },
        {
          city: 'Mumbai',
          hotelId: 'hotel-1',
          signalType: 'TOURISM_SPIKE',
          score: 8,
          createdAt: new Date('2026-03-14T10:00:00.000Z'),
        },
      ],
      { batchSize: 120 },
    );
    expect(summary.rankedEntries).toBe(2);
  });
});
