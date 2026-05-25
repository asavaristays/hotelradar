import { jest } from '@jest/globals';
import {
  TOURISM_SPIKE,
  buildTourismSpikeSignals,
  runMarketHotelTourismSpikeSignalEngine,
} from '../src/services/lead-radar/marketHotelTourismSpikeSignalService.js';
import { DEMAND_SURGE_CLUSTER } from '../src/services/lead-radar/marketHotelDemandSurgeClusterSignalService.js';
import { EVENT_DEMAND_ZONE } from '../src/services/lead-radar/marketHotelEventDemandZoneSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from '../src/services/lead-radar/marketHotelReviewSignalService.js';

describe('marketHotelTourismSpikeSignalService', () => {
  test('buildTourismSpikeSignals flags hotels with at least 3 nearby active-demand signals', () => {
    const hotels = Array.from({ length: 5 }, (_, index) => ({
      id: `hotel-${index + 1}`,
      hotelName: `Hotel ${index + 1}`,
      city: 'Goa',
    }));
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.7 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.2 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 2.4 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 3.2 },
    ];
    const existingSignals = [
      { hotelId: 'hotel-2', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
      { hotelId: 'hotel-3', signalType: EVENT_DEMAND_ZONE, signalStrength: 4 },
      { hotelId: 'hotel-4', signalType: DEMAND_SURGE_CLUSTER, signalStrength: 3 },
    ];

    const result = buildTourismSpikeSignals(hotels, neighbors, existingSignals, {
      maxDistanceKm: 3,
      minNeighborSignalCount: 3,
    });

    expect(result.hotelsScanned).toBe(5);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: TOURISM_SPIKE,
        signalStrength: 3,
      },
    ]);
  });

  test('runMarketHotelTourismSpikeSignalEngine replaces only TOURISM_SPIKE rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 9,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelTourismSpikeSignalEngine(
      { city: 'Mumbai', batchSize: 80, maxDistanceKm: 3, minNeighborSignalCount: 3 },
      {
        listMarketHotelsForSignals: async () =>
          Array.from({ length: 4 }, (_, index) => ({
            id: `hotel-${index + 1}`,
            hotelName: `Hotel ${index + 1}`,
            city: 'Mumbai',
          })),
        listMarketHotelNeighbors: async () => [
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.9 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.4 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 2.5 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'hotel-2', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.2 },
          { hotelId: 'hotel-3', signalType: EVENT_DEMAND_ZONE, signalStrength: 4 },
          { hotelId: 'hotel-4', signalType: DEMAND_SURGE_CLUSTER, signalStrength: 5 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['hotel-1', 'hotel-2', 'hotel-3', 'hotel-4'],
      [
        {
          hotelId: 'hotel-1',
          signalType: TOURISM_SPIKE,
          signalStrength: 3,
        },
      ],
      { batchSize: 80, signalTypes: [TOURISM_SPIKE] },
    );
    expect(summary.hotelsScanned).toBe(4);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(9);
  });
});
