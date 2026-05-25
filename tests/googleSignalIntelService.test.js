import { jest } from '@jest/globals';
import { env } from '../src/config/env.js';
import { getLeadRadarExternalSignals } from '../src/services/googleSignalIntelService.js';

describe('googleSignalIntelService', () => {
  const originalGoogleSearchApiKey = env.googleSearchApiKey;
  const originalGoogleSearchEngineId = env.googleSearchEngineId;
  const originalGoogleTrendsSnapshotFile = env.googleTrendsSnapshotFile;
  const originalEnableGoogleTrendsLive = env.enableGoogleTrendsLive;
  const originalGoogleTrendsTimeframe = env.googleTrendsTimeframe;

  afterEach(() => {
    env.googleSearchApiKey = originalGoogleSearchApiKey;
    env.googleSearchEngineId = originalGoogleSearchEngineId;
    env.googleTrendsSnapshotFile = originalGoogleTrendsSnapshotFile;
    env.enableGoogleTrendsLive = originalEnableGoogleTrendsLive;
    env.googleTrendsTimeframe = originalGoogleTrendsTimeframe;
  });

  test('builds Google Custom Search signals for LeadRADAR', async () => {
    env.googleSearchApiKey = 'search-key';
    env.googleSearchEngineId = 'search-engine';
    env.googleTrendsSnapshotFile = '';
    env.enableGoogleTrendsLive = false;

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        searchInformation: { totalResults: '4200' },
        items: [
          {
            title: 'Infosys annual summit in Jaipur',
            link: 'https://example.com/infosys-jaipur',
            snippet: 'Corporate event momentum in Jaipur this week.',
            displayLink: 'example.com',
          },
        ],
      }),
    });

    const payload = await getLeadRadarExternalSignals(
      { city: 'Jaipur' },
      {
        fetchImpl,
        readFile: jest.fn(),
      },
    );

    expect(payload.city).toBe('Jaipur');
    expect(payload.providers.googleSearchEnabled).toBe(true);
    expect(payload.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Jaipur',
          signalType: 'CORPORATE_EVENT_CLUSTER',
          source: 'google_custom_search',
        }),
        expect.objectContaining({
          city: 'Jaipur',
          signalType: 'WEDDING_DEMAND_ZONE',
          source: 'google_custom_search',
        }),
      ]),
    );
    expect(fetchImpl).toHaveBeenCalled();
  });

  test('merges optional Google Trends snapshot signals', async () => {
    env.googleSearchApiKey = '';
    env.googleSearchEngineId = '';
    env.googleTrendsSnapshotFile = '/tmp/google-trends.json';
    env.enableGoogleTrendsLive = false;

    const readFile = jest.fn().mockResolvedValue(
      JSON.stringify({
        signals: [
          {
            city: 'Mumbai',
            signalType: 'TOURISM_SPIKE',
            title: 'Mumbai search momentum rising',
            impactScore: 74,
            confidenceScore: 81,
          },
        ],
      }),
    );

    const payload = await getLeadRadarExternalSignals(
      { city: 'Mumbai' },
      {
        fetchImpl: jest.fn(),
        readFile,
      },
    );

    expect(payload.providers.googleSearchEnabled).toBe(false);
    expect(payload.providers.googleTrendsEnabled).toBe(true);
    expect(payload.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Mumbai',
          source: 'google_trends',
          signalType: 'TOURISM_SPIKE',
          impactScore: 74,
        }),
      ]),
    );
  });

  test('builds live Google Trends signals for supported cities', async () => {
    env.googleSearchApiKey = '';
    env.googleSearchEngineId = '';
    env.googleTrendsSnapshotFile = '';
    env.enableGoogleTrendsLive = true;
    env.googleTrendsTimeframe = 'now 7-d';

    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `)]}',\n${JSON.stringify({
            widgets: [
              {
                id: 'TIMESERIES',
                token: 'widget-token',
                request: { query: 'Jaipur wedding' },
              },
            ],
          })}`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `)]}',\n${JSON.stringify({
            default: {
              timelineData: [
                { formattedTime: 'Mar 13', value: [42] },
                { formattedTime: 'Mar 14', value: [74] },
                { formattedTime: 'Mar 15', value: [81] },
              ],
            },
          })}`,
      })
      .mockResolvedValue({
        ok: false,
        text: async () => 'not configured',
      });

    const payload = await getLeadRadarExternalSignals(
      { city: 'Jaipur' },
      {
        fetchImpl,
        readFile: jest.fn(),
      },
    );

    expect(payload.providers.googleTrendsEnabled).toBe(true);
    expect(payload.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Jaipur',
          source: 'google_trends_live',
          details: expect.arrayContaining([
            expect.objectContaining({
              time: 'Mar 15',
              value: 81,
            }),
          ]),
        }),
      ]),
    );
  });
});
