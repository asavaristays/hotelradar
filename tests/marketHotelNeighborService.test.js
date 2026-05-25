import { jest } from '@jest/globals';
import {
  haversineDistanceKm,
  runMarketHotelNeighborDetection,
} from '../src/services/lead-radar/marketHotelNeighborService.js';

describe('marketHotelNeighborService', () => {
  test('haversineDistanceKm returns near-zero for identical coordinates', () => {
    expect(
      haversineDistanceKm(
        { latitude: 15.5, longitude: 73.8 },
        { latitude: 15.5, longitude: 73.8 },
      ),
    ).toBeCloseTo(0, 5);
  });

  test('runMarketHotelNeighborDetection keeps only same-city hotels within 5km and max 20 neighbors', async () => {
    const goaHotels = Array.from({ length: 22 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      hotelName: `Goa Hotel ${index + 1}`,
      city: 'Goa',
      latitude: 15.5 + index * 0.002,
      longitude: 73.8,
      googlePlaceId: `goa-place-${index + 1}`,
    }));
    const jaipurHotel = {
      id: '00000000-0000-4000-8000-999999999999',
      hotelName: 'Jaipur Hotel',
      city: 'Jaipur',
      latitude: 26.9,
      longitude: 75.8,
      googlePlaceId: 'jaipur-place-1',
    };

    const replaceMarketHotelNeighbors = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 0,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelNeighborDetection(
      {
        city: 'Goa',
        processingBatchSize: 5,
        insertBatchSize: 10,
        maxDistanceKm: 5,
        maxNeighbors: 20,
      },
      {
        listMarketHotelsWithCoordinates: async () => [...goaHotels, jaipurHotel],
        replaceMarketHotelNeighbors,
      },
    );

    expect(replaceMarketHotelNeighbors).toHaveBeenCalledTimes(1);
    const [hotelIds, rows, options] = replaceMarketHotelNeighbors.mock.calls[0];

    expect(hotelIds).toHaveLength(22);
    expect(options).toEqual({ batchSize: 10 });
    expect(summary.totalHotelsProcessed).toBe(22);
    expect(summary.totalNeighborsCreated).toBe(rows.length);
    expect(rows.length).toBe(440);
    expect(rows.every((row) => row.distanceKm <= 5)).toBe(true);
    expect(rows.every((row) => row.hotelId !== row.neighborHotelId)).toBe(true);
  });

  test('runMarketHotelNeighborDetection handles empty datasets', async () => {
    const replaceMarketHotelNeighbors = jest.fn();

    const summary = await runMarketHotelNeighborDetection(
      { city: 'Mumbai' },
      {
        listMarketHotelsWithCoordinates: async () => [],
        replaceMarketHotelNeighbors,
      },
    );

    expect(summary.totalHotelsProcessed).toBe(0);
    expect(summary.totalNeighborsCreated).toBe(0);
    expect(replaceMarketHotelNeighbors).not.toHaveBeenCalled();
  });
});
