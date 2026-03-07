import { computeDataHealthSnapshot } from '../../src/services/dataHealthService.js';

function inMemoryDeps() {
  const store = new Map();

  return {
    async upsertDataHealthIssue(payload) {
      const key = `${payload.hotelId}:${payload.issueCode}`;
      const prev = store.get(key);
      const now = new Date().toISOString();
      store.set(key, {
        issue_code: payload.issueCode,
        title: payload.title,
        severity: payload.severity,
        status: 'open',
        message: payload.message,
        metadata: payload.metadata || {},
        first_detected_at: prev?.first_detected_at || now,
        last_detected_at: now,
        resolved_at: null,
        reopen_count: prev?.status === 'resolved' ? Number(prev.reopen_count || 0) + 1 : Number(prev?.reopen_count || 0),
        updated_at: now,
      });
    },
    async resolveInactiveDataHealthIssues(hotelId, activeCodes = []) {
      for (const [key, row] of store.entries()) {
        if (!key.startsWith(`${hotelId}:`)) continue;
        if (row.status !== 'open') continue;
        if (activeCodes.includes(row.issue_code)) continue;
        row.status = 'resolved';
        row.resolved_at = new Date().toISOString();
        row.updated_at = new Date().toISOString();
        store.set(key, row);
      }
      return [];
    },
    async listDataHealthIssues(hotelId) {
      const rows = [];
      for (const [key, row] of store.entries()) {
        if (!key.startsWith(`${hotelId}:`)) continue;
        rows.push(row);
      }
      return rows;
    },
  };
}

describe('dataHealthService', () => {
  test('returns client-safe summary for hotel users', async () => {
    const deps = inMemoryDeps();
    const output = await computeDataHealthSnapshot(
      {
        hotelId: 'h1',
        viewerRole: 'hotel_user',
        calibration: {},
        competitorRates: [],
        airfareSeries: [],
        lastScrapedAt: '2026-02-20T00:00:00.000Z',
        otaParity: {
          parityThresholdPct: 2,
          alertThresholdPct: 5,
          summary: { maxAbsGapPct: 11 },
        },
        confidence: { score: 52 },
        marketStability: { volatilityScore: 72 },
        performanceSummary: { sampleSize: 9, rollingAccuracy30d: 45, stabilityDeviation: 31 },
      },
      deps,
    );

    expect(output).toHaveProperty('statuses');
    expect(output).toHaveProperty('knownIssues');
    expect(output).toHaveProperty('note');
    expect(output).not.toHaveProperty('diagnostics');
    expect(output.issueCounts.open).toBeGreaterThan(0);
  });

  test('includes diagnostics for admin and resolves cleared issues', async () => {
    const deps = inMemoryDeps();

    await computeDataHealthSnapshot(
      {
        hotelId: 'h2',
        viewerRole: 'admin',
        calibration: {},
        competitorRates: [],
        airfareSeries: [],
        lastScrapedAt: '2026-02-20T00:00:00.000Z',
        otaParity: {
          parityThresholdPct: 2,
          alertThresholdPct: 5,
          summary: { maxAbsGapPct: 12 },
        },
        confidence: { score: 50 },
        marketStability: { volatilityScore: 75 },
        performanceSummary: { sampleSize: 10, rollingAccuracy30d: 40, stabilityDeviation: 35 },
      },
      deps,
    );

    const second = await computeDataHealthSnapshot(
      {
        hotelId: 'h2',
        viewerRole: 'admin',
        calibration: {},
        competitorRates: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
        airfareSeries: Array.from({ length: 10 }, (_, i) => ({ id: i })),
        lastScrapedAt: new Date().toISOString(),
        otaParity: {
          sourceStatus: 'scraped',
          rows: [{ channel: 'Booking.com', otaPrice: 10100, estimated: false, status: 'In Parity' }],
          parityThresholdPct: 2,
          alertThresholdPct: 5,
          summary: { maxAbsGapPct: 1.2 },
        },
        confidence: { score: 84 },
        marketStability: { volatilityScore: 32 },
        performanceSummary: { sampleSize: 10, rollingAccuracy30d: 78, stabilityDeviation: 12 },
      },
      deps,
    );

    expect(second).toHaveProperty('diagnostics');
    expect(second.issueCounts.open).toBe(0);
    expect(second.issueCounts.resolved).toBeGreaterThan(0);
    expect(Array.isArray(second.resolvedRecently)).toBe(true);
    expect(second.signalQuality).toEqual(
      expect.objectContaining({
        grade: expect.any(String),
        mode: expect.any(String),
        summary: expect.any(String),
      }),
    );
  });

  test('forces verify mode for Goa/Mumbai when event feed or live OTA coverage is weak', async () => {
    const deps = inMemoryDeps();
    const output = await computeDataHealthSnapshot(
      {
        hotelId: 'h3',
        city: 'Mumbai',
        viewerRole: 'admin',
        calibration: {},
        competitorRates: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
        airfareSeries: Array.from({ length: 10 }, (_, i) => ({ id: i })),
        events: [],
        lastScrapedAt: new Date().toISOString(),
        lastEventSync: null,
        otaParity: {
          sourceStatus: 'estimated',
          rows: [],
          parityThresholdPct: 2,
          alertThresholdPct: 5,
          summary: { maxAbsGapPct: 0 },
        },
        confidence: { score: 82 },
        marketStability: { volatilityScore: 24 },
        performanceSummary: { sampleSize: 9, rollingAccuracy30d: 76, stabilityDeviation: 10 },
      },
      deps,
    );

    expect(output.signalQuality).toEqual(
      expect.objectContaining({
        grade: 'Review',
        mode: 'verify',
      }),
    );
    expect(output.signalQuality.summary.toLowerCase()).toContain('event feed');
    expect(output.signalQuality.summary.toLowerCase()).toContain('live ota rows');
  });
});
