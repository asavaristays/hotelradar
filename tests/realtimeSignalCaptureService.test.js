import { runRealtimeSignalCaptureCycle } from '../src/services/realtimeSignalCaptureService.js';

function missingFileError() {
  const error = new Error('missing file');
  error.code = 'ENOENT';
  return error;
}

function buildDeps(overrides = {}) {
  const observations = [];
  const recalcJobs = [];
  const finishedRuns = [];
  const sourceHealthUpdates = [];
  const deps = {
    listActiveHotelsForIngestion: async () => [
      {
        id: 'hotel-goa-1',
        hotel_name: 'The Ten Resort Siolem',
        city: 'Goa',
      },
    ],
    getCompetitorByHotelAndName: async () => null,
    insertCompetitor: async ({ competitorName }) => ({ id: `comp-${competitorName}`, competitor_name: competitorName }),
    getLatestCompetitorPrice: async () => null,
    insertCompetitorRateSnapshot: async (payload) => payload,
    insertHotelRateSnapshot: async (payload) => payload,
    createRealtimeSignalRun: async () => ({ id: 'run-1' }),
    finishRealtimeSignalRun: async (payload) => {
      finishedRuns.push(payload);
      return payload;
    },
    insertRealtimeSignalObservation: async (payload) => {
      observations.push(payload);
      return payload;
    },
    listLatestRateEvidence: async () => [],
    listEnabledVerifiedLiveDataSources: async () => [],
    updateVerifiedLiveDataSourceHealth: async (payload) => {
      sourceHealthUpdates.push(payload);
      return payload;
    },
    collectVerifiedLiveDataSourceRows: async () => ({ rows: [], sourceResults: [] }),
    listUpcomingEventsByCity: async () => [
      {
        city: 'Goa',
        event_name: 'Goa Destination Wedding Showcase',
        venue: 'North Goa',
        start_date: '2026-08-12',
        end_date: '2026-08-13',
        category: 'wedding',
        scale: 'large',
        confidence: 'confirmed',
        event_url: 'https://example.com/wedding',
        impact_score: 18,
        scraped_at: '2026-08-01T08:00:00.000Z',
      },
      {
        city: 'Goa',
        event_name: 'Goa MICE Expo and Corporate Summit',
        venue: 'Panaji',
        start_date: '2026-08-18',
        end_date: '2026-08-18',
        category: 'conference',
        scale: 'medium',
        confidence: 'high',
        event_url: 'https://example.com/mice',
        impact_score: 14,
        scraped_at: '2026-08-01T08:00:00.000Z',
      },
    ],
    enqueueRecalculationJob: async (payload) => {
      recalcJobs.push(payload);
      return payload;
    },
    readFile: async () => {
      throw missingFileError();
    },
    execFile: async () => ({ stdout: '', stderr: '' }),
    ...overrides,
  };
  return { deps, observations, recalcJobs, finishedRuns, sourceHealthUpdates };
}

describe('realtimeSignalCaptureService', () => {
  test('mirrors wedding and MICE events into hotel-level realtime observations', async () => {
    const { deps, observations, recalcJobs, finishedRuns } = buildDeps();

    const summary = await runRealtimeSignalCaptureCycle(
      {
        snapshotPath: '/tmp/hotelradar-no-snapshot.json',
        source: 'test-realtime-capture',
        cadence: 'manual',
        eventHorizonDays: 45,
      },
      deps,
    );

    expect(summary.snapshotRows).toBe(0);
    expect(summary.missingSnapshot).toBe(true);
    expect(summary.eventRows).toBe(2);
    expect(summary.weddingRows).toBe(1);
    expect(summary.miceRows).toBe(1);
    expect(observations).toHaveLength(2);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hotelId: 'hotel-goa-1',
          sourceType: 'event',
          signalType: 'event_signal',
          sourceName: 'Goa Destination Wedding Showcase',
          checkinDate: '2026-08-12',
          valueNumeric: 18,
          metadata: expect.objectContaining({ eventType: 'wedding' }),
        }),
        expect.objectContaining({
          hotelId: 'hotel-goa-1',
          sourceType: 'event',
          signalType: 'event_signal',
          sourceName: 'Goa MICE Expo and Corporate Summit',
          checkinDate: '2026-08-18',
          valueNumeric: 14,
          metadata: expect.objectContaining({ eventType: 'mice' }),
        }),
      ]),
    );
    expect(recalcJobs).toHaveLength(2);
    expect(finishedRuns[0]).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        status: 'completed',
      }),
    );
  });

  test('verifies snapshot rate rows and rejects invalid zero-rate evidence', async () => {
    const snapshotRows = [
      {
        hotel_name: 'The Ten Resort Siolem',
        city: 'Goa',
        checkin_date: '2026-08-16',
        is_hotel_rate: true,
        rate: 36800,
        source_name: 'The Ten booking engine',
        proof_url: '',
        confidence_score: 95,
      },
      {
        hotel_name: 'The Ten Resort Siolem',
        city: 'Goa',
        checkin_date: '2026-08-16',
        competitor_name: 'Agoda',
        rate: 35400,
        proof_url: 'https://www.agoda.com/the-ten-goa/rates',
        confidence_score: 84,
      },
      {
        hotel_name: 'The Ten Resort Siolem',
        city: 'Goa',
        checkin_date: '2026-08-16',
        competitor_name: 'Invalid OTA',
        rate: 0,
        proof_url: 'https://example.com/invalid',
      },
    ];
    const { deps, observations } = buildDeps({
      readFile: async () => JSON.stringify({ rows: snapshotRows }),
      listUpcomingEventsByCity: async () => [],
    });

    const summary = await runRealtimeSignalCaptureCycle(
      {
        snapshotPath: '/tmp/hotelradar-snapshot.json',
        source: 'test-realtime-capture',
        cadence: 'manual',
      },
      deps,
    );

    expect(summary.snapshotRows).toBe(3);
    expect(summary.hotelRateRows).toBe(1);
    expect(summary.otaRows).toBe(1);
    expect(summary.skippedRows).toBe(1);
    expect(summary.needsProofRows).toBe(1);
    expect(summary.verifiedRows).toBe(1);
    expect(summary.sourceTypeRows).toEqual(expect.objectContaining({ official: 1, ota: 1 }));
    expect(observations).toHaveLength(2);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'official',
          signalType: 'hotel_rate',
          valueNumeric: 36800,
          confidenceScore: 72,
          metadata: expect.objectContaining({ verificationStatus: 'needs_proof' }),
        }),
        expect.objectContaining({
          sourceType: 'ota',
          signalType: 'ota_rate',
          valueNumeric: 35400,
          metadata: expect.objectContaining({ verificationStatus: 'verified' }),
        }),
      ]),
    );
  });

  test('captures configured verified live-data source rows and updates source health', async () => {
    const { deps, observations, sourceHealthUpdates } = buildDeps({
      listUpcomingEventsByCity: async () => [],
      listEnabledVerifiedLiveDataSources: async () => [
        {
          id: 'source-official-1',
          hotel_id: 'hotel-goa-1',
          hotel_name: 'The Ten Resort Siolem',
          city: 'Goa',
          source_type: 'official',
          source_name: 'The Ten booking engine',
          adapter_type: 'official_rate_manifest',
          source_url: '/tmp/the-ten-official-rates.json',
        },
      ],
      collectVerifiedLiveDataSourceRows: async () => ({
        sourceResults: [{ sourceId: 'source-official-1', status: 'ok', rows: 1, error: null }],
        rows: [
          {
            hotel_id: 'hotel-goa-1',
            city: 'Goa',
            checkin_date: '2026-08-17',
            source_type: 'official',
            source_name: 'The Ten booking engine',
            signal_type: 'hotel_rate',
            rate: 37200,
            proof_url: 'https://letsbook.me/booking/994038?checkin=2026-08-17',
            connector_name: 'official_rate_manifest',
          },
        ],
      }),
    });

    const summary = await runRealtimeSignalCaptureCycle(
      {
        snapshotPath: '/tmp/hotelradar-no-snapshot.json',
        source: 'test-realtime-capture',
        cadence: 'manual',
      },
      deps,
    );

    expect(summary.configuredSourcesChecked).toBe(1);
    expect(summary.configuredSourcesOk).toBe(1);
    expect(summary.configuredSourceRows).toBe(1);
    expect(summary.hotelRateRows).toBe(1);
    expect(summary.verifiedRows).toBe(1);
    expect(sourceHealthUpdates).toEqual([
      expect.objectContaining({
        sourceId: 'source-official-1',
        status: 'ok',
        metadata: expect.objectContaining({ lastRows: 1, lastRunId: 'run-1' }),
      }),
    ]);
    expect(observations).toEqual([
      expect.objectContaining({
        sourceType: 'official',
        signalType: 'hotel_rate',
        valueNumeric: 37200,
        proofUrl: 'https://letsbook.me/booking/994038?checkin=2026-08-17',
        metadata: expect.objectContaining({ verificationStatus: 'verified' }),
      }),
    ]);
  });
});
