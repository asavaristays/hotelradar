import { jest } from '@jest/globals';
import { getMarketIntelligenceMapPayload } from '../src/services/intelligenceMapService.js';

describe('intelligenceMapService', () => {
  test('returns recent signal coordinates for the map payload', async () => {
    const listRecentMarketSignalsForMap = jest.fn(async () => [
      {
        signalType: 'WEEKEND_COMPRESSION',
        city: 'Goa',
        latitude: 15.5351,
        longitude: 73.7642,
        location: 'Candolim',
        intensity: 0.9,
        timestamp: '2026-03-14T14:30:00Z',
        createdAt: '2026-03-14T14:30:00Z',
      },
    ]);

    const payload = await getMarketIntelligenceMapPayload(
      { limit: 1000, hours: 24 },
      { listRecentMarketSignalsForMap },
    );

    expect(listRecentMarketSignalsForMap).toHaveBeenCalledWith({ limit: 1000, hours: 24 });
    expect(payload).toEqual({
      signals: [
        {
          signalType: 'WEEKEND_COMPRESSION',
          city: 'Goa',
          latitude: 15.5351,
          longitude: 73.7642,
          location: 'Candolim',
          intensity: 0.9,
          timestamp: '2026-03-14T14:30:00Z',
          createdAt: '2026-03-14T14:30:00Z',
        },
      ],
    });
  });
});
