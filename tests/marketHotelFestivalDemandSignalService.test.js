import { jest } from '@jest/globals';
import {
  FESTIVAL_DEMAND,
  buildFestivalDemandSignals,
  runMarketHotelFestivalDemandSignalEngine,
} from '../src/services/lead-radar/marketHotelFestivalDemandSignalService.js';

describe('marketHotelFestivalDemandSignalService', () => {
  test('buildFestivalDemandSignals flags hotels within 5km of festival-category events', () => {
    const events = [
      {
        id: 'event-1',
        city: 'Goa',
        eventName: 'Goa Carnival',
        category: 'carnival',
        latitude: 15.5,
        longitude: 73.8,
      },
    ];
    const hotels = [
      { id: 'hotel-1', hotelName: 'Hotel 1', city: 'Goa', latitude: 15.51, longitude: 73.81 },
      { id: 'hotel-2', hotelName: 'Hotel 2', city: 'Goa', latitude: 15.53, longitude: 73.82 },
      { id: 'hotel-3', hotelName: 'Hotel 3', city: 'Goa', latitude: 16.2, longitude: 74.4 },
    ];

    const result = buildFestivalDemandSignals(events, hotels, { maxDistanceKm: 5 });

    expect(result.eventsScanned).toBe(1);
    expect(result.signals).toEqual([
      { hotelId: 'hotel-1', signalType: FESTIVAL_DEMAND, signalStrength: 1 },
      { hotelId: 'hotel-2', signalType: FESTIVAL_DEMAND, signalStrength: 1 },
    ]);
  });

  test('runMarketHotelFestivalDemandSignalEngine replaces only FESTIVAL_DEMAND rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 11,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelFestivalDemandSignalEngine(
      { city: 'Jaipur', batchSize: 120, maxDistanceKm: 5 },
      {
        listFestivalCityEvents: async () => [
          {
            id: 'event-1',
            city: 'Jaipur',
            eventName: 'Jaipur Festival',
            category: 'city festival',
            latitude: 26.91,
            longitude: 75.79,
          },
        ],
        listMarketHotelsWithCoordinates: async () => [
          { id: 'hotel-1', hotelName: 'Hotel 1', city: 'Jaipur', latitude: 26.915, longitude: 75.795 },
          { id: 'hotel-2', hotelName: 'Hotel 2', city: 'Jaipur', latitude: 26.918, longitude: 75.8 },
          { id: 'hotel-3', hotelName: 'Hotel 3', city: 'Jaipur', latitude: 27.2, longitude: 76.1 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['hotel-1', 'hotel-2', 'hotel-3'],
      [
        { hotelId: 'hotel-1', signalType: FESTIVAL_DEMAND, signalStrength: 1 },
        { hotelId: 'hotel-2', signalType: FESTIVAL_DEMAND, signalStrength: 1 },
      ],
      { batchSize: 120, signalTypes: [FESTIVAL_DEMAND] },
    );
    expect(summary.eventsScanned).toBe(1);
    expect(summary.signalsCreated).toBe(2);
    expect(summary.deletedSignals).toBe(11);
  });
});
