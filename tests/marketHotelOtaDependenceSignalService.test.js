import { jest } from '@jest/globals';
import {
  OTA_DEPENDENCE,
  buildOtaDependenceSignals,
  runMarketHotelOtaDependenceSignalEngine,
} from '../src/services/lead-radar/marketHotelOtaDependenceSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from '../src/services/lead-radar/marketHotelReviewSignalService.js';

describe('marketHotelOtaDependenceSignalService', () => {
  test('buildOtaDependenceSignals flags hotels with strong ratings, review volume, and HIGH_REVIEW_ACTIVITY', () => {
    const hotels = [
      { id: 'a', hotelName: 'Alpha', city: 'Goa', googleRating: 4.3, reviewCount: 180 },
      { id: 'b', hotelName: 'Beta', city: 'Goa', googleRating: 3.9, reviewCount: 220 },
      { id: 'c', hotelName: 'Gamma', city: 'Goa', googleRating: 4.5, reviewCount: 90 },
    ];
    const existingSignals = [
      { hotelId: 'a', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.4 },
      { hotelId: 'b', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
    ];

    const result = buildOtaDependenceSignals(hotels, existingSignals);

    expect(result.hotelsScanned).toBe(3);
    expect(result.signals).toEqual([
      {
        hotelId: 'a',
        signalType: OTA_DEPENDENCE,
        signalStrength: 180,
      },
    ]);
  });

  test('runMarketHotelOtaDependenceSignalEngine replaces only OTA_DEPENDENCE rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 5,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelOtaDependenceSignalEngine(
      { city: 'Mumbai', batchSize: 25 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Mumbai', googleRating: 4.2, reviewCount: 250 },
          { id: '2', hotelName: 'Two', city: 'Mumbai', googleRating: 4.4, reviewCount: 95 },
          { id: '3', hotelName: 'Three', city: 'Mumbai', googleRating: 3.8, reviewCount: 300 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: '1', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.2 },
          { hotelId: '3', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.6 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2', '3'],
      [
        {
          hotelId: '1',
          signalType: OTA_DEPENDENCE,
          signalStrength: 250,
        },
      ],
      { batchSize: 25, signalTypes: [OTA_DEPENDENCE] },
    );
    expect(summary.hotelsScanned).toBe(3);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(5);
  });
});
