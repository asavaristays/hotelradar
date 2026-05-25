import { jest } from '@jest/globals';
import {
  AIRPORT_DEMAND,
  buildAirportDemandSignals,
  runMarketHotelAirportDemandSignalEngine,
} from '../src/services/lead-radar/marketHotelAirportDemandSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from '../src/services/lead-radar/marketHotelReviewSignalService.js';
import { TOURISM_SPIKE } from '../src/services/lead-radar/marketHotelTourismSpikeSignalService.js';

describe('marketHotelAirportDemandSignalService', () => {
  test('buildAirportDemandSignals flags tourism-spike hotels with at least 2 nearby high-review hotels', () => {
    const hotels = Array.from({ length: 4 }, (_, index) => ({
      id: `hotel-${index + 1}`,
      hotelName: `Hotel ${index + 1}`,
      city: 'Mumbai',
    }));
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.8 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.6 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 3.2 },
    ];
    const existingSignals = [
      { hotelId: 'hotel-1', signalType: TOURISM_SPIKE, signalStrength: 3 },
      { hotelId: 'hotel-2', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.4 },
      { hotelId: 'hotel-3', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
    ];

    const result = buildAirportDemandSignals(hotels, neighbors, existingSignals, {
      maxDistanceKm: 3,
      minNeighborCount: 2,
    });

    expect(result.hotelsScanned).toBe(1);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: AIRPORT_DEMAND,
        signalStrength: 2,
      },
    ]);
  });

  test('runMarketHotelAirportDemandSignalEngine replaces only AIRPORT_DEMAND rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 5,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelAirportDemandSignalEngine(
      { city: 'Goa', batchSize: 90, maxDistanceKm: 3, minNeighborCount: 2 },
      {
        listMarketHotelsForSignals: async () =>
          Array.from({ length: 3 }, (_, index) => ({
            id: `hotel-${index + 1}`,
            hotelName: `Hotel ${index + 1}`,
            city: 'Goa',
          })),
        listMarketHotelNeighbors: async () => [
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 1.1 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 2.2 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'hotel-1', signalType: TOURISM_SPIKE, signalStrength: 4 },
          { hotelId: 'hotel-2', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.3 },
          { hotelId: 'hotel-3', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['hotel-1', 'hotel-2', 'hotel-3'],
      [
        {
          hotelId: 'hotel-1',
          signalType: AIRPORT_DEMAND,
          signalStrength: 2,
        },
      ],
      { batchSize: 90, signalTypes: [AIRPORT_DEMAND] },
    );
    expect(summary.hotelsScanned).toBe(1);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(5);
  });
});
