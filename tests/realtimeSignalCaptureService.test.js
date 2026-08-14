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
  return { deps, observations, recalcJobs, finishedRuns };
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
});
