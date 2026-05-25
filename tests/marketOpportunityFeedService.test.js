import { jest } from '@jest/globals';
import {
  buildMarketOpportunityFeedEntries,
  runMarketOpportunityFeedEngine,
} from '../src/services/lead-radar/marketOpportunityFeedService.js';

describe('marketOpportunityFeedService', () => {
  test('buildMarketOpportunityFeedEntries keeps strongest eligible recent rows and limits 200 per city', () => {
    const baseTime = new Date('2026-03-14T09:00:00.000Z');
    const signals = [
      {
        city: 'Goa',
        signalType: 'HIGH_REVIEW_ACTIVITY',
        hotelId: 'hotel-low',
        createdAt: new Date('2026-03-14T10:00:00.000Z'),
        signalStrength: 1.5,
      },
      {
        city: 'Goa',
        signalType: 'DEMAND_SURGE_CLUSTER',
        hotelId: 'hotel-priority',
        createdAt: new Date('2026-03-14T11:00:00.000Z'),
        signalStrength: 1,
      },
      {
        city: 'Mumbai',
        signalType: 'HIGH_REVIEW_ACTIVITY',
        hotelId: 'hotel-strong',
        createdAt: baseTime,
        signalStrength: 2.25,
      },
      ...Array.from({ length: 205 }, (_, index) => ({
        city: 'Jaipur',
        signalType: 'WEEKEND_COMPRESSION',
        hotelId: `hotel-${index.toString().padStart(3, '0')}`,
        createdAt: new Date(Date.parse('2026-03-14T12:00:00.000Z') - index * 60_000),
        signalStrength: 3,
      })),
    ];

    const result = buildMarketOpportunityFeedEntries(signals, {
      minSignalStrength: 2,
      perCityLimit: 200,
    });

    expect(result.some((row) => row.hotelId === 'hotel-low')).toBe(false);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Goa',
          signalType: 'DEMAND_SURGE_CLUSTER',
          hotelId: 'hotel-priority',
          signalStrength: 1,
        }),
        expect.objectContaining({
          city: 'Mumbai',
          signalType: 'HIGH_REVIEW_ACTIVITY',
          hotelId: 'hotel-strong',
          signalStrength: 2.25,
        }),
      ]),
    );
    expect(result.filter((row) => row.city === 'Jaipur')).toHaveLength(200);
    expect(result.find((row) => row.city === 'Jaipur')).toEqual(
      expect.objectContaining({ hotelId: 'hotel-000' }),
    );
  });

  test('runMarketOpportunityFeedEngine rebuilds the feed from recent signals', async () => {
    const replaceMarketOpportunityFeed = jest.fn(async (rows) => ({
      rowCount: rows.length,
    }));

    const summary = await runMarketOpportunityFeedEngine(
      { city: 'Goa', batchSize: 120, lookbackHours: 24, perCityLimit: 200 },
      {
        listRecentMarketHotelSignalsForFeed: async () => [
          {
            city: 'Goa',
            signalType: 'DEMAND_SURGE_CLUSTER',
            hotelId: 'hotel-1',
            createdAt: new Date('2026-03-14T10:00:00.000Z'),
            signalStrength: 1,
          },
          {
            city: 'Goa',
            signalType: 'HIGH_REVIEW_ACTIVITY',
            hotelId: 'hotel-2',
            createdAt: new Date('2026-03-14T09:00:00.000Z'),
            signalStrength: 3.5,
          },
          {
            city: 'Goa',
            signalType: 'HIGH_REVIEW_ACTIVITY',
            hotelId: 'hotel-3',
            createdAt: new Date('2026-03-14T08:00:00.000Z'),
            signalStrength: 1.5,
          },
        ],
        replaceMarketOpportunityFeed,
      },
    );

    expect(replaceMarketOpportunityFeed).toHaveBeenCalledWith(
      [
        {
          city: 'Goa',
          signalType: 'DEMAND_SURGE_CLUSTER',
          hotelId: 'hotel-1',
          createdAt: new Date('2026-03-14T10:00:00.000Z'),
          signalStrength: 1,
        },
        {
          city: 'Goa',
          signalType: 'HIGH_REVIEW_ACTIVITY',
          hotelId: 'hotel-2',
          createdAt: new Date('2026-03-14T09:00:00.000Z'),
          signalStrength: 3.5,
        },
      ],
      { batchSize: 120 },
    );
    expect(summary.signalsInserted).toBe(2);
  });
});
