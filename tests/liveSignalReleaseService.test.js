import { getReleasedLeadRadarSignals } from '../src/services/liveSignalReleaseService.js';

describe('liveSignalReleaseService', () => {
  test('releases staged city signals into the temp live table flow', async () => {
    const now = new Date('2026-03-19T08:00:00.000Z').toISOString();
    const upserted = [];

    const payload = await getReleasedLeadRadarSignals(
      { city: 'Mumbai' },
      {
        getLeadRadarExternalSignals: async () => ({
          signals: [
            {
              city: 'Mumbai',
              signalType: 'CORPORATE_EVENT_CLUSTER',
              source: 'google_custom_search',
              title: 'Infosys summit search momentum rising',
              description: 'Top search themes show corporate movement.',
              recommendedAction: 'Push weekday corporate packages.',
              impactScore: 74,
              confidenceScore: 80,
              createdAt: now,
              details: [{ title: 'Infosys summit Mumbai' }],
            },
          ],
          providers: {
            googleSearchEnabled: true,
            googleTrendsEnabled: false,
          },
        }),
        getMarketOpportunityFeed: async () => ({
          opportunities: [
            {
              city: 'Mumbai',
              hotel_id: 'hotel-1',
              hotel_name: 'Hotel One',
              signal_type: 'PRICE_PRESSURE',
              title: 'Price pressure',
              description: 'Rates moving up nearby.',
              recommended_action: 'Tighten pricing guardrails.',
              impact_score: 68,
              confidence_score: 70,
              created_at: now,
              latitude: 19.07,
              longitude: 72.87,
            },
          ],
        }),
        listRecentMarketSignalsForMap: async () => ([
          {
            signalType: 'AIRPORT_DEMAND',
            city: 'Mumbai',
            latitude: 19.08,
            longitude: 72.88,
            location: 'Mumbai Airport',
            intensity: 0.76,
            createdAt: now,
          },
        ]),
        expireMarketLiveSignals: async () => ({ rowCount: 0 }),
        getLatestReleasedMarketLiveSignalAt: async () => null,
        upsertMarketLiveSignals: async (rows) => {
          upserted.push(...rows);
          return { rowCount: rows.length };
        },
        listReleasedMarketLiveSignals: async () =>
          upserted
            .filter((row) => row.status === 'released')
            .map((row, index) => ({
              id: String(index + 1),
              city: row.city,
              signalType: row.signalType,
              source: row.source,
              title: row.title,
              description: row.description,
              recommendedAction: row.recommendedAction,
              impactScore: row.impactScore,
              confidenceScore: row.confidenceScore,
              observedAt: row.observedAt,
              metadata: row.metadata,
            })),
      },
    );

    expect(payload.city).toBe('Mumbai');
    expect(payload.refreshed).toBe(true);
    expect(payload.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signalType: 'CORPORATE_EVENT_CLUSTER', source: 'google_custom_search' }),
        expect.objectContaining({ signalType: 'PRICE_PRESSURE', source: 'market_opportunity_feed' }),
        expect.objectContaining({ signalType: 'AIRPORT_DEMAND', source: 'market_signal_engine' }),
      ]),
    );
  });
});
