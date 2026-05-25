import { jest } from '@jest/globals';
import {
  DEMAND_SURGE_CLUSTER,
  buildDemandSurgeClusterSignals,
  runMarketHotelDemandSurgeClusterSignalEngine,
} from '../src/services/lead-radar/marketHotelDemandSurgeClusterSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from '../src/services/lead-radar/marketHotelReviewSignalService.js';

describe('marketHotelDemandSurgeClusterSignalService', () => {
  test('buildDemandSurgeClusterSignals flags hotels with at least 5 high-review neighbors within 3km', () => {
    const hotels = Array.from({ length: 7 }, (_, index) => ({
      id: `hotel-${index + 1}`,
      hotelName: `Hotel ${index + 1}`,
      city: 'Goa',
    }));
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 1.1 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.3 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 1.5 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 2.2 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-6', distanceKm: 2.8 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-7', distanceKm: 3.4 },
    ];
    const existingSignals = hotels.map((hotel) => ({
      hotelId: hotel.id,
      signalType: HIGH_REVIEW_ACTIVITY,
      signalStrength: 2.1,
    }));

    const result = buildDemandSurgeClusterSignals(hotels, neighbors, existingSignals, {
      maxDistanceKm: 3,
      minNeighborCount: 5,
    });

    expect(result.clustersScanned).toBe(7);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: DEMAND_SURGE_CLUSTER,
        signalStrength: 5,
      },
    ]);
  });

  test('runMarketHotelDemandSurgeClusterSignalEngine replaces only DEMAND_SURGE_CLUSTER rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 6,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelDemandSurgeClusterSignalEngine(
      { city: 'Mumbai', batchSize: 50, maxDistanceKm: 3, minNeighborCount: 5 },
      {
        listMarketHotelsForSignals: async () =>
          Array.from({ length: 6 }, (_, index) => ({
            id: `hotel-${index + 1}`,
            hotelName: `Hotel ${index + 1}`,
            city: 'Mumbai',
          })),
        listMarketHotelNeighbors: async () => [
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.6 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 0.8 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 1.1 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 1.6 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-6', distanceKm: 2.5 },
        ],
        listMarketHotelSignals: async () =>
          Array.from({ length: 6 }, (_, index) => ({
            hotelId: `hotel-${index + 1}`,
            signalType: HIGH_REVIEW_ACTIVITY,
            signalStrength: 2.3,
          })),
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['hotel-1', 'hotel-2', 'hotel-3', 'hotel-4', 'hotel-5', 'hotel-6'],
      [
        {
          hotelId: 'hotel-1',
          signalType: DEMAND_SURGE_CLUSTER,
          signalStrength: 5,
        },
      ],
      { batchSize: 50, signalTypes: [DEMAND_SURGE_CLUSTER] },
    );
    expect(summary.clustersScanned).toBe(6);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(6);
  });
});
