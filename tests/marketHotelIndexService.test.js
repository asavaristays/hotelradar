import { jest } from '@jest/globals';
import {
  buildNearbySearchGrid,
  collectGoogleMarketHotels,
  normalizeGooglePlaceResult,
  normalizeMarketHotelName,
  runMarketHotelIndex,
} from '../src/services/lead-radar/marketHotelIndexService.js';

describe('marketHotelIndexService', () => {
  test('normalizeMarketHotelName trims whitespace and trailing city tokens', () => {
    expect(normalizeMarketHotelName('  Hotel Prime  Goa  ', 'Goa')).toBe('Hotel Prime');
    expect(normalizeMarketHotelName('Seabreeze Candolim - Goa', 'Goa')).toBe('Seabreeze Candolim');
    expect(normalizeMarketHotelName('Royal Heritage Haveli', 'Jaipur')).toBe('Royal Heritage Haveli');
  });

  test('normalizeGooglePlaceResult skips results without coordinates or place id', () => {
    expect(
      normalizeGooglePlaceResult(
        {
          id: 'place-1',
          name: 'Goa Stay',
          rating: 4.3,
          user_ratings_total: 212,
          geometry: {},
        },
        { city: 'Goa', source: 'google-maps-nearby-grid:hotels in Goa' },
      ),
    ).toBeNull();
  });

  test('buildNearbySearchGrid creates multiple Goa search cells', () => {
    const cells = buildNearbySearchGrid('Goa', {
      radiusMeters: 2500,
      stepMeters: 50_000,
    });

    expect(cells.length).toBeGreaterThan(1);
    expect(cells[0]).toEqual(
      expect.objectContaining({
        latitude: expect.any(Number),
        longitude: expect.any(Number),
        radiusMeters: 2500,
      }),
    );
  });

  test('buildNearbySearchGrid supports Jaipur', () => {
    const cells = buildNearbySearchGrid('Jaipur', {
      radiusMeters: 2500,
      stepMeters: 50_000,
    });

    expect(cells.length).toBeGreaterThan(0);
  });

  test('buildNearbySearchGrid supports Mumbai', () => {
    const cells = buildNearbySearchGrid('Mumbai', {
      radiusMeters: 2500,
      stepMeters: 50_000,
    });

    expect(cells.length).toBeGreaterThan(0);
  });

  test('buildNearbySearchGrid supports Delhi and Gurugram', () => {
    const delhiCells = buildNearbySearchGrid('Delhi', {
      radiusMeters: 2500,
      stepMeters: 50_000,
    });
    const gurugramCells = buildNearbySearchGrid('Gurugram', {
      radiusMeters: 2500,
      stepMeters: 50_000,
    });

    expect(delhiCells.length).toBeGreaterThan(0);
    expect(gurugramCells.length).toBeGreaterThan(0);
  });

  test('collectGoogleMarketHotels sweeps grid, dedupes by place id, and skips missing coordinates', async () => {
    const fetchImpl = jest.fn(async (_url, request) => {
      const body = JSON.parse(request.body);
      const latitude = Number(body.locationRestriction.circle.center.latitude.toFixed(4));

      if (latitude === 14.85) {
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'place-1',
                displayName: { text: 'Seabreeze Candolim - Goa' },
                location: { latitude: 15.5201, longitude: 73.7681 },
                rating: 4.2,
                userRatingCount: 180,
              },
              {
                id: 'missing-coords',
                displayName: { text: 'Missing Coords Resort' },
                location: {},
                rating: 4.0,
                userRatingCount: 90,
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: 'place-1',
              displayName: { text: 'Seabreeze Candolim' },
              location: { latitude: 15.5201, longitude: 73.7681 },
              rating: 4.3,
              userRatingCount: 250,
            },
            {
              id: 'place-2',
              displayName: { text: 'The Acacia Morjim Goa' },
              location: { latitude: 15.6299, longitude: 73.7398 },
              rating: 4.5,
              userRatingCount: 310,
            },
          ],
        }),
      };
    });

    const summary = await collectGoogleMarketHotels({
      city: 'Goa',
      apiKey: 'test-key',
      fetchImpl,
      minDelayMs: 0,
      radiusMeters: 2500,
      stepMeters: 50_000,
    });

    expect(summary.gridCellCount).toBeGreaterThan(1);
    expect(summary.rawResults).toBe(summary.gridCellCount * 2);
    expect(summary.skippedMissingCoordinates).toBeGreaterThanOrEqual(1);
    expect(summary.hotels).toHaveLength(2);
    expect(summary.hotels[0]).toEqual(
      expect.objectContaining({
        googlePlaceId: 'place-1',
        hotelName: 'Seabreeze Candolim',
        city: 'Goa',
        googleRating: 4.3,
        reviewCount: 250,
      }),
    );
    expect(summary.hotels[1]).toEqual(
      expect.objectContaining({
        googlePlaceId: 'place-2',
        hotelName: 'The Acacia Morjim',
        city: 'Goa',
      }),
    );
  });

  test('runMarketHotelIndex inserts in batches and returns summary counts', async () => {
    const insertedBatches = [];
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'place-1',
            displayName: { text: 'Seabreeze Candolim' },
            location: { latitude: 15.5201, longitude: 73.7681 },
            rating: 4.3,
            userRatingCount: 250,
          },
          {
            id: 'place-2',
            displayName: { text: 'The Acacia Morjim Goa' },
            location: { latitude: 15.6299, longitude: 73.7398 },
            rating: 4.5,
            userRatingCount: 310,
          },
        ],
      }),
    }));

    const summary = await runMarketHotelIndex(
      {
        city: 'Goa',
        apiKey: 'test-key',
        batchSize: 1,
        minDelayMs: 0,
        radiusMeters: 2500,
        stepMeters: 200_000,
      },
      {
        fetchImpl,
        deleteMarketHotelsMissingPlaceIdByCity: async () => ({ rowCount: 3 }),
        getMarketHotelCountsByCity: async () => ({ totalHotels: 2, withPlaceId: 2 }),
        upsertMarketHotels: async (rows, options) => {
          insertedBatches.push({ rows, options });
          return { rowCount: rows.length };
        },
      },
    );

    expect(insertedBatches).toHaveLength(1);
    expect(insertedBatches[0].options).toEqual({ batchSize: 1 });
    expect(insertedBatches[0].rows).toHaveLength(2);
    expect(insertedBatches[0].rows[0]).toEqual(
      expect.objectContaining({ googlePlaceId: 'place-1' }),
    );
    expect(summary.gridCellCount).toBe(1);
    expect(summary.totalHotelsCollected).toBe(2);
    expect(summary.cleanedLegacyRows).toBe(3);
    expect(summary.finalStoredHotels).toBe(2);
    expect(summary.finalStoredWithPlaceId).toBe(2);
    expect(summary.rowsUpserted).toBe(2);
  });
});
