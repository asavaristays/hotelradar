import { jest } from '@jest/globals';
import {
  fetchPlaceContactDetails,
  runMarketHotelContactEnrichment,
} from '../src/services/lead-radar/marketHotelContactEnrichmentService.js';

describe('marketHotelContactEnrichmentService', () => {
  test('fetchPlaceContactDetails maps Places Details fields', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        websiteUri: 'https://example.com',
        nationalPhoneNumber: '+91 9876543210',
        googleMapsUri: 'https://maps.google.com/example',
      }),
    }));

    const result = await fetchPlaceContactDetails('abc123', 'key', fetchImpl);

    expect(fetchImpl).toHaveBeenCalled();
    expect(result).toEqual({
      website: 'https://example.com',
      phone: '+91 9876543210',
      googleMapsUrl: 'https://maps.google.com/example',
    });
  });

  test('runMarketHotelContactEnrichment only updates missing rows and reports progress counts', async () => {
    const updateMarketHotelContactFields = jest.fn(async () => ({ rowCount: 1 }));

    const summary = await runMarketHotelContactEnrichment(
      { batchSize: 50, delayMs: 0, apiKey: 'test-key' },
      {
        listMarketHotelsMissingContactFields: async () => [
          { id: 'hotel-1', googlePlaceId: 'place-1' },
          { id: 'hotel-2', googlePlaceId: 'place-2' },
        ],
        updateMarketHotelContactFields,
        fetch: jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              websiteUri: 'https://one.example',
              nationalPhoneNumber: '+91 1111111111',
              googleMapsUri: 'https://maps.google.com/one',
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              websiteUri: 'https://two.example',
              nationalPhoneNumber: '+91 2222222222',
              googleMapsUri: 'https://maps.google.com/two',
            }),
          }),
      },
    );

    expect(updateMarketHotelContactFields).toHaveBeenNthCalledWith(1, 'hotel-1', {
      website: 'https://one.example',
      phone: '+91 1111111111',
      googleMapsUrl: 'https://maps.google.com/one',
    });
    expect(updateMarketHotelContactFields).toHaveBeenNthCalledWith(2, 'hotel-2', {
      website: 'https://two.example',
      phone: '+91 2222222222',
      googleMapsUrl: 'https://maps.google.com/two',
    });
    expect(summary).toEqual({
      startCount: 2,
      processed: 2,
      updatedRows: 2,
      errors: 0,
    });
  });
});
