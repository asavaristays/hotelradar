import { jest } from '@jest/globals';
import {
  EVENT_DEMAND_ZONE,
  buildEventDemandZoneSignals,
  runMarketHotelEventDemandZoneSignalEngine,
} from '../src/services/lead-radar/marketHotelEventDemandZoneSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from '../src/services/lead-radar/marketHotelReviewSignalService.js';
import { PRICE_PRESSURE } from '../src/services/lead-radar/marketHotelPricePressureSignalService.js';

describe('marketHotelEventDemandZoneSignalService', () => {
  test('buildEventDemandZoneSignals flags high-review hotels surrounded by active demand neighbors', () => {
    const hotels = Array.from({ length: 6 }, (_, index) => ({
      id: `hotel-${index + 1}`,
      hotelName: `Hotel ${index + 1}`,
      city: 'Goa',
    }));
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.5 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.1 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 1.4 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 2.7 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-6', distanceKm: 3.4 },
    ];
    const existingSignals = [
      { hotelId: 'hotel-1', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.3 },
      { hotelId: 'hotel-2', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
      { hotelId: 'hotel-3', signalType: PRICE_PRESSURE, signalStrength: 180 },
      { hotelId: 'hotel-4', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.4 },
      { hotelId: 'hotel-5', signalType: PRICE_PRESSURE, signalStrength: 220 },
    ];

    const result = buildEventDemandZoneSignals(hotels, neighbors, existingSignals, {
      maxDistanceKm: 3,
      minNeighborCount: 4,
    });

    expect(result.hotelsScanned).toBe(3);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: EVENT_DEMAND_ZONE,
        signalStrength: 4,
      },
    ]);
  });

  test('runMarketHotelEventDemandZoneSignalEngine replaces only EVENT_DEMAND_ZONE rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 7,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelEventDemandZoneSignalEngine(
      { city: 'Mumbai', batchSize: 40, maxDistanceKm: 3, minNeighborCount: 4 },
      {
        listMarketHotelsForSignals: async () =>
          Array.from({ length: 5 }, (_, index) => ({
            id: `hotel-${index + 1}`,
            hotelName: `Hotel ${index + 1}`,
            city: 'Mumbai',
          })),
        listMarketHotelNeighbors: async () => [
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.8 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.1 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 1.7 },
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 2.6 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'hotel-1', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.2 },
          { hotelId: 'hotel-2', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.4 },
          { hotelId: 'hotel-3', signalType: PRICE_PRESSURE, signalStrength: 190 },
          { hotelId: 'hotel-4', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.5 },
          { hotelId: 'hotel-5', signalType: PRICE_PRESSURE, signalStrength: 210 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['hotel-1', 'hotel-2', 'hotel-3', 'hotel-4', 'hotel-5'],
      [
        {
          hotelId: 'hotel-1',
          signalType: EVENT_DEMAND_ZONE,
          signalStrength: 4,
        },
      ],
      { batchSize: 40, signalTypes: [EVENT_DEMAND_ZONE] },
    );
    expect(summary.hotelsScanned).toBe(3);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(7);
  });
});
