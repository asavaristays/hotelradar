import { jest } from '@jest/globals';
import {
  CORPORATE_EVENT_CLUSTER,
  buildCorporateEventClusterSignals,
  runMarketHotelCorporateEventClusterSignalEngine,
} from '../src/services/lead-radar/marketHotelCorporateEventClusterSignalService.js';

describe('marketHotelCorporateEventClusterSignalService', () => {
  test('buildCorporateEventClusterSignals flags qualified hotels with at least 4 qualified neighbors within 3km', () => {
    const hotels = [
      { id: 'hotel-1', hotelName: 'Hotel 1', city: 'Mumbai', googleRating: 4.2, reviewCount: 200 },
      { id: 'hotel-2', hotelName: 'Hotel 2', city: 'Mumbai', googleRating: 4.3, reviewCount: 220 },
      { id: 'hotel-3', hotelName: 'Hotel 3', city: 'Mumbai', googleRating: 4.1, reviewCount: 180 },
      { id: 'hotel-4', hotelName: 'Hotel 4', city: 'Mumbai', googleRating: 4.5, reviewCount: 240 },
      { id: 'hotel-5', hotelName: 'Hotel 5', city: 'Mumbai', googleRating: 4.4, reviewCount: 260 },
      { id: 'hotel-6', hotelName: 'Hotel 6', city: 'Mumbai', googleRating: 3.9, reviewCount: 300 },
    ];
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 0.8 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 1.0 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 1.6 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-5', distanceKm: 2.2 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-6', distanceKm: 2.4 },
    ];

    const result = buildCorporateEventClusterSignals(hotels, neighbors, {
      maxDistanceKm: 3,
      minNeighborCount: 4,
      minGoogleRating: 4,
      minReviewCount: 150,
    });

    expect(result.hotelsScanned).toBe(5);
    expect(result.signals).toEqual([
      {
        hotelId: 'hotel-1',
        signalType: CORPORATE_EVENT_CLUSTER,
        signalStrength: 4,
      },
    ]);
  });

  test('runMarketHotelCorporateEventClusterSignalEngine replaces only CORPORATE_EVENT_CLUSTER rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 4,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelCorporateEventClusterSignalEngine(
      { city: 'Goa', batchSize: 75, maxDistanceKm: 3, minNeighborCount: 4 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Goa', googleRating: 4.3, reviewCount: 210 },
          { id: '2', hotelName: 'Two', city: 'Goa', googleRating: 4.1, reviewCount: 170 },
          { id: '3', hotelName: 'Three', city: 'Goa', googleRating: 4.2, reviewCount: 180 },
          { id: '4', hotelName: 'Four', city: 'Goa', googleRating: 4.4, reviewCount: 220 },
          { id: '5', hotelName: 'Five', city: 'Goa', googleRating: 4.5, reviewCount: 260 },
        ],
        listMarketHotelNeighbors: async () => [
          { hotelId: '1', neighborHotelId: '2', distanceKm: 0.7 },
          { hotelId: '1', neighborHotelId: '3', distanceKm: 1.2 },
          { hotelId: '1', neighborHotelId: '4', distanceKm: 1.8 },
          { hotelId: '1', neighborHotelId: '5', distanceKm: 2.6 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2', '3', '4', '5'],
      [
        {
          hotelId: '1',
          signalType: CORPORATE_EVENT_CLUSTER,
          signalStrength: 4,
        },
      ],
      { batchSize: 75, signalTypes: [CORPORATE_EVENT_CLUSTER] },
    );
    expect(summary.hotelsScanned).toBe(5);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(4);
  });
});
