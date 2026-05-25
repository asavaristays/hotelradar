import { jest } from '@jest/globals';
import {
  REPUTATION_WEAKNESS,
  buildReputationWeaknessSignals,
  runMarketHotelReputationSignalEngine,
} from '../src/services/lead-radar/marketHotelReputationSignalService.js';

describe('marketHotelReputationSignalService', () => {
  test('buildReputationWeaknessSignals flags low-rated hotels with above-neighbor review volume', () => {
    const hotels = [
      { id: 'a', hotelName: 'Alpha', city: 'Goa', googleRating: 3.7, reviewCount: 300 },
      { id: 'b', hotelName: 'Beta', city: 'Goa', googleRating: 4.4, reviewCount: 100 },
      { id: 'c', hotelName: 'Gamma', city: 'Goa', googleRating: 4.1, reviewCount: 120 },
      { id: 'd', hotelName: 'Delta', city: 'Goa', googleRating: 3.8, reviewCount: 50 },
    ];
    const neighbors = [
      { hotelId: 'a', neighborHotelId: 'b', distanceKm: 1.2 },
      { hotelId: 'a', neighborHotelId: 'c', distanceKm: 1.4 },
      { hotelId: 'd', neighborHotelId: 'b', distanceKm: 0.8 },
      { hotelId: 'd', neighborHotelId: 'c', distanceKm: 1.0 },
    ];

    const result = buildReputationWeaknessSignals(hotels, neighbors, {
      weakRatingThreshold: 4,
    });

    expect(result.hotelsScanned).toBe(4);
    expect(result.signals).toEqual([
      expect.objectContaining({
        hotelId: 'a',
        signalType: REPUTATION_WEAKNESS,
        signalStrength: 0.55,
      }),
    ]);
  });

  test('runMarketHotelReputationSignalEngine replaces only REPUTATION_WEAKNESS rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 4,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelReputationSignalEngine(
      { city: 'Mumbai', batchSize: 20, weakRatingThreshold: 4 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Mumbai', googleRating: 3.8, reviewCount: 200 },
          { id: '2', hotelName: 'Two', city: 'Mumbai', googleRating: 4.5, reviewCount: 80 },
          { id: '3', hotelName: 'Three', city: 'Mumbai', googleRating: 4.1, reviewCount: 90 },
        ],
        listMarketHotelNeighbors: async () => [
          { hotelId: '1', neighborHotelId: '2', distanceKm: 0.5 },
          { hotelId: '1', neighborHotelId: '3', distanceKm: 0.8 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2', '3'],
      [
        expect.objectContaining({
          hotelId: '1',
          signalType: REPUTATION_WEAKNESS,
          signalStrength: 0.5,
        }),
      ],
      { batchSize: 20, signalTypes: [REPUTATION_WEAKNESS] },
    );
    expect(summary.hotelsScanned).toBe(3);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(4);
  });
});
