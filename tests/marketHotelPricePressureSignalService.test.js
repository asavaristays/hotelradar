import { jest } from '@jest/globals';
import {
  PRICE_PRESSURE,
  buildPricePressureSignals,
  runMarketHotelPricePressureSignalEngine,
} from '../src/services/lead-radar/marketHotelPricePressureSignalService.js';
import { DEMAND_SURGE_CLUSTER } from '../src/services/lead-radar/marketHotelDemandSurgeClusterSignalService.js';

describe('marketHotelPricePressureSignalService', () => {
  test('buildPricePressureSignals flags high-rated, high-review hotels already in demand surge clusters', () => {
    const hotels = [
      { id: 'a', hotelName: 'Alpha', city: 'Goa', googleRating: 4.2, reviewCount: 180 },
      { id: 'b', hotelName: 'Beta', city: 'Goa', googleRating: 4.5, reviewCount: 120 },
      { id: 'c', hotelName: 'Gamma', city: 'Goa', googleRating: 3.9, reviewCount: 220 },
    ];
    const existingSignals = [
      { hotelId: 'a', signalType: DEMAND_SURGE_CLUSTER, signalStrength: 4 },
      { hotelId: 'b', signalType: DEMAND_SURGE_CLUSTER, signalStrength: 3 },
    ];

    const result = buildPricePressureSignals(hotels, existingSignals);

    expect(result.hotelsScanned).toBe(3);
    expect(result.signals).toEqual([
      {
        hotelId: 'a',
        signalType: PRICE_PRESSURE,
        signalStrength: 180,
      },
    ]);
  });

  test('runMarketHotelPricePressureSignalEngine replaces only PRICE_PRESSURE rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 2,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelPricePressureSignalEngine(
      { city: 'Mumbai', batchSize: 30 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Mumbai', googleRating: 4.4, reviewCount: 220 },
          { id: '2', hotelName: 'Two', city: 'Mumbai', googleRating: 4.1, reviewCount: 140 },
          { id: '3', hotelName: 'Three', city: 'Mumbai', googleRating: 3.8, reviewCount: 260 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: '1', signalType: DEMAND_SURGE_CLUSTER, signalStrength: 5 },
          { hotelId: '3', signalType: DEMAND_SURGE_CLUSTER, signalStrength: 6 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2', '3'],
      [
        {
          hotelId: '1',
          signalType: PRICE_PRESSURE,
          signalStrength: 220,
        },
      ],
      { batchSize: 30, signalTypes: [PRICE_PRESSURE] },
    );
    expect(summary.hotelsScanned).toBe(3);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(2);
  });
});
