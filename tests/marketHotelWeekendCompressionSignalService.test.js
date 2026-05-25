import { jest } from '@jest/globals';
import {
  WEEKEND_COMPRESSION,
  buildWeekendCompressionSignals,
  runMarketHotelWeekendCompressionSignalEngine,
} from '../src/services/lead-radar/marketHotelWeekendCompressionSignalService.js';
import { EVENT_DEMAND_ZONE } from '../src/services/lead-radar/marketHotelEventDemandZoneSignalService.js';
import { TOURISM_SPIKE } from '../src/services/lead-radar/marketHotelTourismSpikeSignalService.js';
import { WEDDING_DEMAND_ZONE } from '../src/services/lead-radar/marketHotelWeddingDemandZoneSignalService.js';

describe('marketHotelWeekendCompressionSignalService', () => {
  test('buildWeekendCompressionSignals flags hotels with at least 3 nearby weekend-demand signals', () => {
    const hotels = Array.from({ length: 5 }, (_, index) => ({
      id: `hotel-${index + 1}`,
      hotelName: `Hotel ${index + 1}`,
      city: 'Goa',
    }));
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.8 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.4 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 2.3 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 3.2 },
    ];
    const existingSignals = [
      { hotelId: 'hotel-2', signalType: TOURISM_SPIKE, signalStrength: 3 },
      { hotelId: 'hotel-3', signalType: EVENT_DEMAND_ZONE, signalStrength: 4 },
      { hotelId: 'hotel-4', signalType: WEDDING_DEMAND_ZONE, signalStrength: 3 },
    ];

    const result = buildWeekendCompressionSignals(hotels, neighbors, existingSignals, {
      maxDistanceKm: 3,
      minNeighborSignalCount: 3,
    });

    expect(result.hotelsScanned).toBe(5);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: WEEKEND_COMPRESSION,
        signalStrength: 3,
      },
    ]);
  });

  test('runMarketHotelWeekendCompressionSignalEngine replaces only WEEKEND_COMPRESSION rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 8,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelWeekendCompressionSignalEngine(
      { city: 'Mumbai', batchSize: 100, maxDistanceKm: 3, minNeighborSignalCount: 3 },
      {
        listMarketHotelsForSignals: async () =>
          Array.from({ length: 4 }, (_, index) => ({
            id: `hotel-${index + 1}`,
            hotelName: `Hotel ${index + 1}`,
            city: 'Mumbai',
          })),
        listMarketHotelNeighbors: async () => [
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.7 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.8 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 2.6 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'hotel-2', signalType: TOURISM_SPIKE, signalStrength: 3 },
          { hotelId: 'hotel-3', signalType: EVENT_DEMAND_ZONE, signalStrength: 4 },
          { hotelId: 'hotel-4', signalType: WEDDING_DEMAND_ZONE, signalStrength: 3 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['hotel-1', 'hotel-2', 'hotel-3', 'hotel-4'],
      [
        {
          hotelId: 'hotel-1',
          signalType: WEEKEND_COMPRESSION,
          signalStrength: 3,
        },
      ],
      { batchSize: 100, signalTypes: [WEEKEND_COMPRESSION] },
    );
    expect(summary.hotelsScanned).toBe(4);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(8);
  });
});
