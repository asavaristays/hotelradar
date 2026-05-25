import { jest } from '@jest/globals';
import {
  WEDDING_DEMAND_ZONE,
  buildWeddingDemandZoneSignals,
  runMarketHotelWeddingDemandZoneSignalEngine,
} from '../src/services/lead-radar/marketHotelWeddingDemandZoneSignalService.js';
import { EVENT_DEMAND_ZONE } from '../src/services/lead-radar/marketHotelEventDemandZoneSignalService.js';

describe('marketHotelWeddingDemandZoneSignalService', () => {
  test('buildWeddingDemandZoneSignals flags event-demand hotels with at least 3 strong nearby hotels', () => {
    const hotels = [
      { id: 'hotel-1', hotelName: 'Hotel 1', city: 'Jaipur', googleRating: 4.1, reviewCount: 160 },
      { id: 'hotel-2', hotelName: 'Hotel 2', city: 'Jaipur', googleRating: 4.2, reviewCount: 250 },
      { id: 'hotel-3', hotelName: 'Hotel 3', city: 'Jaipur', googleRating: 4.4, reviewCount: 220 },
      { id: 'hotel-4', hotelName: 'Hotel 4', city: 'Jaipur', googleRating: 4.5, reviewCount: 210 },
      { id: 'hotel-5', hotelName: 'Hotel 5', city: 'Jaipur', googleRating: 3.9, reviewCount: 260 },
    ];
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.5 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.1 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 2.4 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 2.1 },
    ];
    const existingSignals = [
      { hotelId: 'hotel-1', signalType: EVENT_DEMAND_ZONE, signalStrength: 4 },
    ];

    const result = buildWeddingDemandZoneSignals(hotels, neighbors, existingSignals, {
      maxDistanceKm: 3,
      minNeighborCount: 3,
      minGoogleRating: 4,
      minReviewCount: 200,
    });

    expect(result.hotelsScanned).toBe(1);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: WEDDING_DEMAND_ZONE,
        signalStrength: 3,
      },
    ]);
  });

  test('runMarketHotelWeddingDemandZoneSignalEngine replaces only WEDDING_DEMAND_ZONE rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 3,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelWeddingDemandZoneSignalEngine(
      { city: 'Goa', batchSize: 60, maxDistanceKm: 3, minNeighborCount: 3 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Goa', googleRating: 4.0, reviewCount: 180 },
          { id: '2', hotelName: 'Two', city: 'Goa', googleRating: 4.4, reviewCount: 240 },
          { id: '3', hotelName: 'Three', city: 'Goa', googleRating: 4.2, reviewCount: 260 },
          { id: '4', hotelName: 'Four', city: 'Goa', googleRating: 4.6, reviewCount: 210 },
        ],
        listMarketHotelNeighbors: async () => [
          { hotelId: '1', neighborHotelId: '2', distanceKm: 0.6 },
          { hotelId: '1', neighborHotelId: '3', distanceKm: 1.4 },
          { hotelId: '1', neighborHotelId: '4', distanceKm: 2.2 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: '1', signalType: EVENT_DEMAND_ZONE, signalStrength: 4 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2', '3', '4'],
      [
        {
          hotelId: '1',
          signalType: WEDDING_DEMAND_ZONE,
          signalStrength: 3,
        },
      ],
      { batchSize: 60, signalTypes: [WEDDING_DEMAND_ZONE] },
    );
    expect(summary.hotelsScanned).toBe(1);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(3);
  });
});
