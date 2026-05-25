import { jest } from '@jest/globals';
import {
  HIGH_REVIEW_ACTIVITY,
  buildHighReviewActivitySignals,
  runMarketHotelReviewSignalEngine,
} from '../src/services/lead-radar/marketHotelReviewSignalService.js';

describe('marketHotelReviewSignalService', () => {
  test('buildHighReviewActivitySignals flags hotels with review volume ratio >= 2', () => {
    const hotels = [
      { id: 'a', hotelName: 'Alpha', city: 'Goa', reviewCount: 400 },
      { id: 'b', hotelName: 'Beta', city: 'Goa', reviewCount: 100 },
      { id: 'c', hotelName: 'Gamma', city: 'Goa', reviewCount: 80 },
      { id: 'd', hotelName: 'Delta', city: 'Goa', reviewCount: null },
    ];
    const neighbors = [
      { hotelId: 'a', neighborHotelId: 'b', distanceKm: 1.1 },
      { hotelId: 'a', neighborHotelId: 'c', distanceKm: 1.3 },
      { hotelId: 'b', neighborHotelId: 'a', distanceKm: 1.1 },
      { hotelId: 'b', neighborHotelId: 'c', distanceKm: 0.7 },
      { hotelId: 'c', neighborHotelId: 'a', distanceKm: 1.3 },
      { hotelId: 'c', neighborHotelId: 'b', distanceKm: 0.7 },
      { hotelId: 'd', neighborHotelId: 'a', distanceKm: 0.5 },
    ];

    const result = buildHighReviewActivitySignals(hotels, neighbors, {
      minReviewVolumeRatio: 2,
    });

    expect(result.hotelsScanned).toBe(4);
    expect(result.signals).toEqual([
      expect.objectContaining({
        hotelId: 'a',
        signalType: HIGH_REVIEW_ACTIVITY,
        signalStrength: 4.4444,
      }),
    ]);
  });

  test('runMarketHotelReviewSignalEngine replaces only HIGH_REVIEW_ACTIVITY rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 2,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelReviewSignalEngine(
      { city: 'Jaipur', batchSize: 10, minReviewVolumeRatio: 2 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Jaipur', reviewCount: 300 },
          { id: '2', hotelName: 'Two', city: 'Jaipur', reviewCount: 100 },
        ],
        listMarketHotelNeighbors: async () => [
          { hotelId: '1', neighborHotelId: '2', distanceKm: 0.5 },
          { hotelId: '2', neighborHotelId: '1', distanceKm: 0.5 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2'],
      [
        expect.objectContaining({
          hotelId: '1',
          signalType: HIGH_REVIEW_ACTIVITY,
          signalStrength: 3,
        }),
      ],
      { batchSize: 10, signalTypes: [HIGH_REVIEW_ACTIVITY] },
    );
    expect(summary.hotelsScanned).toBe(2);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(2);
  });

  test('runMarketHotelReviewSignalEngine handles empty datasets', async () => {
    const replaceMarketHotelSignals = jest.fn();

    const summary = await runMarketHotelReviewSignalEngine(
      {},
      {
        listMarketHotelsForSignals: async () => [],
        listMarketHotelNeighbors: async () => [],
        replaceMarketHotelSignals,
      },
    );

    expect(summary.hotelsScanned).toBe(0);
    expect(summary.signalsCreated).toBe(0);
    expect(replaceMarketHotelSignals).not.toHaveBeenCalled();
  });
});
