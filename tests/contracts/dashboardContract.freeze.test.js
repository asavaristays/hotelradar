import { recalculateDashboard } from '../../src/services/dashboardService.js';

function buildAirfareSeries() {
  const out = [];
  for (let i = 0; i < 21; i += 1) {
    out.push({ date: `2026-02-${String(25 - i).padStart(2, '0')}`, avg_price: i < 7 ? 5600 : 5100 });
  }
  return out;
}

function assertDashboardContract(payload) {
  const requiredTopLevel = [
    'hotelId',
    'city',
    'seasonProfile',
    'demandScore',
    'demandLevel',
    'confidence',
    'marketStability',
    'compression',
    'suggestedPricing',
    'marketPosition',
    'signalBreakdown',
    'forwardCurve',
    'narrative',
    'alerts',
    'competitiveGrid',
    'otaParity',
    'dataHealth',
    'performanceSummary',
    'lastUpdated',
  ];

  for (const key of requiredTopLevel) {
    expect(payload).toHaveProperty(key);
  }

  expect(typeof payload.hotelId).toBe('string');
  expect(typeof payload.city).toBe('string');
  expect(typeof payload.seasonProfile).toBe('string');
  expect(typeof payload.demandScore).toBe('number');
  expect(['Low', 'Moderate', 'High', 'Surge']).toContain(payload.demandLevel);
  expect(Array.isArray(payload.forwardCurve)).toBe(true);
  expect(Array.isArray(payload.alerts)).toBe(true);
  expect(Array.isArray(payload.competitiveGrid)).toBe(true);

  expect(payload.confidence).toEqual(
    expect.objectContaining({
      level: expect.any(String),
      score: expect.any(Number),
      factors: expect.any(Array),
      forecastAccuracy60d: expect.any(Number),
      volatilityError: expect.any(Number),
    }),
  );

  expect(payload.marketStability).toEqual(
    expect.objectContaining({
      status: expect.any(String),
      volatilityScore: expect.any(Number),
    }),
  );

  expect(payload.suggestedPricing).toEqual(
    expect.objectContaining({
      base: expect.any(Number),
      riskLevel: expect.any(String),
      marketHeat: expect.any(Number),
      bands: expect.objectContaining({
        safe: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
        aggressive: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
        premium: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      }),
    }),
  );

  expect(payload.marketPosition).toEqual(
    expect.objectContaining({
      hotelPrice: expect.any(Number),
      marketAvg: expect.any(Number),
      positionPct: expect.any(Number),
    }),
  );

  expect(payload.signalBreakdown).toEqual(
    expect.objectContaining({
      competitorMomentum: expect.any(Number),
      holidayImpact: expect.any(Number),
      airfareImpact: expect.any(Number),
      seasonImpact: expect.any(Number),
    }),
  );

  expect(payload.narrative).toEqual(
    expect.objectContaining({
      summary: expect.any(String),
      marketStory: expect.any(String),
      pricingRationale: expect.any(String),
      actionGuidance: expect.any(String),
    }),
  );

  expect(payload.compression).toEqual(
    expect.objectContaining({
      scarcityScore: expect.any(Number),
      priceDispersion: expect.any(Number),
      roomsBelowMarketAvgPct: expect.any(Number),
      compressionLevel: expect.any(String),
      priceVacuumDetected: expect.any(Boolean),
      opportunityBand: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
    }),
  );

  expect(payload.otaParity).toEqual(
    expect.objectContaining({
      hotelPrice: expect.any(Number),
      parityThresholdPct: expect.any(Number),
      alertThresholdPct: expect.any(Number),
      rows: expect.any(Array),
      summary: expect.objectContaining({
        inParity: expect.any(Number),
        underpriced: expect.any(Number),
        overpriced: expect.any(Number),
        maxAbsGapPct: expect.any(Number),
      }),
    }),
  );

  expect(payload.dataHealth).toEqual(
    expect.objectContaining({
      statuses: expect.objectContaining({
        accuracyStatus: expect.any(String),
        freshnessStatus: expect.any(String),
        otaParityStatus: expect.any(String),
        signalConsistency: expect.any(String),
      }),
      issueCounts: expect.objectContaining({
        open: expect.any(Number),
        resolved: expect.any(Number),
      }),
      knownIssues: expect.any(Array),
    }),
  );
}

describe('dashboard contract freeze', () => {
  test('recalculateDashboard returns frozen contract fields and nested structures', async () => {
    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Goa',
        hotel_name: 'Hotel Taj Goa',
        alert_sensitivity: 'balanced',
        season_profile_name: 'Coastal Leisure',
      }),
      getCompetitorRatesForHotel: async () => [
        { id: 'c1', competitor_name: 'A', price_today: 12000, price_48h_ago: 11200, price_7d_ago: 10900 },
        { id: 'c2', competitor_name: 'B', price_today: 11800, price_48h_ago: 11000, price_7d_ago: 10800 },
        { id: 'c3', competitor_name: 'C', price_today: 12100, price_48h_ago: 11300, price_7d_ago: 11100 },
      ],
      getLatestHotelPrice: async () => 11700,
      getAirfareSeries: async () => buildAirfareSeries(),
      getUpcomingHolidays: async () => [{ holiday_date: '2026-02-27', holiday_name: 'Festival', holiday_type: 'public' }],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      getLatestDemandScore: async () => null,
      getPreviousDemandScore: async () => null,
      insertDemandScore: async (payload) => ({
        id: 1,
        demand_score: payload.demandScore,
        level: payload.level,
        recommendation: payload.recommendation,
        confidence: payload.confidence,
        explanation: payload.explanation,
        market_position: payload.marketPosition,
        signals: payload.signals,
        created_at: '2026-02-26T00:00:00.000Z',
      }),
      listActiveAlerts: async () => [],
      evaluateAlerts: async () => ({ created: [], skipped: 0 }),
      getMockCompetitorRates: async () => [],
      getLatestCompetitorScrapeAt: async () => '2026-02-26T00:00:00.000Z',
      getCalibration: async () => null,
      updatePerformanceMetrics: async () => ({
        directionAccuracy: 68,
        alertPrecision: 74,
        positionImprovementPct: 6,
        rollingAccuracy30d: 64,
        stabilityDeviation: 12,
        sampleSize: 8,
      }),
      logAuditTrail: async () => null,
      getPerformance: async () => ({
        direction_accuracy: 68,
        alert_precision: 74,
        position_improvement_pct: 6,
        rolling_accuracy_30d: 64,
        stability_deviation: 12,
        sample_size: 8,
        updated_at: '2026-02-26T00:00:00.000Z',
      }),
      touchHotelCalculatedAt: async () => null,
    };

    const payload = await recalculateDashboard('11111111-1111-4111-8111-111111111111', {}, deps);
    assertDashboardContract(payload);
  });
});
