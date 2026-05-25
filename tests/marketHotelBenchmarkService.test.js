import { jest } from '@jest/globals';
import {
  buildMarketHotelBenchmarks,
  runMarketHotelBenchmarkEngine,
} from '../src/services/lead-radar/marketHotelBenchmarkService.js';

describe('marketHotelBenchmarkService', () => {
  test('buildMarketHotelBenchmarks computes nearby averages and signal counts within 5 km', () => {
    const hotels = [
      { id: 'hotel-1', hotelName: 'One', city: 'Goa', googleRating: 4.2, reviewCount: 100 },
      { id: 'hotel-2', hotelName: 'Two', city: 'Goa', googleRating: 4.4, reviewCount: 200 },
      { id: 'hotel-3', hotelName: 'Three', city: 'Goa', googleRating: 3.8, reviewCount: 50 },
      { id: 'hotel-4', hotelName: 'Four', city: 'Goa', googleRating: null, reviewCount: null },
    ];
    const neighbors = [
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 1.2 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-3', distanceKm: 3.4 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-4', distanceKm: 4.9 },
      { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 5.5 },
    ];
    const signals = [
      { hotelId: 'hotel-2', signalType: 'HIGH_REVIEW_ACTIVITY', signalStrength: 2 },
      { hotelId: 'hotel-2', signalType: 'TOURISM_SPIKE', signalStrength: 3 },
      { hotelId: 'hotel-3', signalType: 'CHATBOT_GAP', signalStrength: 1 },
    ];

    const result = buildMarketHotelBenchmarks(hotels, neighbors, signals, { maxDistanceKm: 5 });

    expect(result).toEqual(
      expect.arrayContaining([
        {
          hotelId: 'hotel-1',
          city: 'Goa',
          nearbyHotelCount: 3,
          avgNearbyRating: 4.1,
          avgNearbyReviews: 125,
          nearbySignalCount: 3,
        },
      ]),
    );
  });

  test('runMarketHotelBenchmarkEngine rebuilds benchmark rows', async () => {
    const replaceMarketHotelBenchmarks = jest.fn(async (rows) => ({
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelBenchmarkEngine(
      { city: 'Mumbai', batchSize: 120, maxDistanceKm: 5 },
      {
        listMarketHotelsForSignals: async () => [
          { id: 'hotel-1', hotelName: 'One', city: 'Mumbai', googleRating: 4.2, reviewCount: 100 },
          { id: 'hotel-2', hotelName: 'Two', city: 'Mumbai', googleRating: 4.4, reviewCount: 200 },
        ],
        listMarketHotelNeighbors: async () => [
          { hotelId: 'hotel-1', neighborHotelId: 'hotel-2', distanceKm: 1.1 },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: 'hotel-2', signalType: 'HIGH_REVIEW_ACTIVITY', signalStrength: 2 },
        ],
        replaceMarketHotelBenchmarks,
      },
    );

    expect(replaceMarketHotelBenchmarks).toHaveBeenCalledWith(
      [
        {
          hotelId: 'hotel-1',
          city: 'Mumbai',
          nearbyHotelCount: 1,
          avgNearbyRating: 4.4,
          avgNearbyReviews: 200,
          nearbySignalCount: 1,
        },
        {
          hotelId: 'hotel-2',
          city: 'Mumbai',
          nearbyHotelCount: 0,
          avgNearbyRating: null,
          avgNearbyReviews: null,
          nearbySignalCount: 0,
        },
      ],
      { batchSize: 120 },
    );
    expect(summary.hotelsProcessed).toBe(2);
  });
});
