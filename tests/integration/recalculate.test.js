import { jest } from '@jest/globals';
import { getDashboard, recalculateDashboard } from '../../src/services/dashboardService.js';

function buildAirfareSeries() {
  const out = [];
  for (let i = 0; i < 21; i += 1) {
    out.push({ date: `2026-02-${String(25 - i).padStart(2, '0')}`, avg_price: i < 7 ? 5600 : 5000 });
  }
  return out;
}

describe('recalculateDashboard integration', () => {
  test('returns dashboard contract response shape', async () => {
    const evaluateAlerts = jest.fn(async () => ({ created: [], skipped: 0 }));

    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Goa',
        hotel_name: 'Hotel Taj Goa',
        alert_sensitivity: 'balanced',
        room_count: 48,
      }),
      getCompetitorRatesForHotel: async () => [
        { id: 'c1', competitor_name: 'A', price_today: 12000, price_48h_ago: 11000, price_7d_ago: 10800 },
        { id: 'c2', competitor_name: 'B', price_today: 11800, price_48h_ago: 10800, price_7d_ago: 10600 },
        { id: 'c3', competitor_name: 'C', price_today: 12100, price_48h_ago: 11100, price_7d_ago: 10900 },
      ],
      getLatestHotelPrice: async () => 11700,
      getAirfareSeries: async () => buildAirfareSeries(),
      getUpcomingHolidays: async () => [
        { holiday_date: '2026-02-27', holiday_name: 'Festival', holiday_type: 'public' },
      ],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      getLatestDemandScore: async () => null,
      insertDemandScore: async (payload) => ({
        demand_score: payload.demandScore,
        level: payload.level,
        recommendation: payload.recommendation,
        explanation: payload.explanation,
        market_position: payload.marketPosition,
        signals: payload.signals,
      }),
      listActiveAlerts: async () => [
        { severity: 'high', message: 'Competitor moved 8%.', created_at: '2026-03-06T09:00:00.000Z' },
        { severity: 'high', message: 'Competitor moved 8%.', created_at: '2026-03-06T09:05:00.000Z' },
        { severity: 'medium', message: 'OTA parity drifted 5%.', created_at: '2026-03-06T09:10:00.000Z' },
        {
          severity: 'critical',
          alert_type: 'surge_window',
          message: 'Demand surge window detected within 3 days.',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      evaluateAlerts,
      getMockCompetitorRates: async () => [],
      getSignalDiagnostics: async () => ({
        ota: { snapshotRows: 4, matchedChannelRows: 1 },
        events: { cityRows: 2, ingestedRows: 1 },
        freshness: { competitorScrapeAt: '2026-03-10T00:00:00.000Z' },
      }),
    };

    const dashboard = await recalculateDashboard(
      '11111111-1111-4111-8111-111111111111',
      { user_role: 'admin' },
      deps,
    );

    expect(dashboard).toHaveProperty('hotelId');
    expect(dashboard).toHaveProperty('city');
    expect(dashboard).toHaveProperty('seasonProfile');
    expect(dashboard).toHaveProperty('demandScore');
    expect(dashboard).toHaveProperty('demandLevel');
    expect(dashboard).toHaveProperty('suggestedPricing');
    expect(dashboard).toHaveProperty('marketPosition');
    expect(dashboard).toHaveProperty('competitiveGrid');
    expect(dashboard).toHaveProperty('explanation');
    expect(dashboard).toHaveProperty('alerts');
    expect(dashboard).toHaveProperty('confidence');
    expect(dashboard).toHaveProperty('marketStability');
    expect(dashboard).toHaveProperty('compression');
    expect(dashboard).toHaveProperty('signalBreakdown');
    expect(dashboard).toHaveProperty('forwardCurve');
    expect(dashboard).toHaveProperty('narrative');
    expect(dashboard).toHaveProperty('otaParity');
    expect(dashboard).toHaveProperty('dataHealth');
    expect(dashboard.dataHealth?.diagnostics).toHaveProperty('pipeline');
    expect(dashboard).toHaveProperty('performanceSummary');
    expect(dashboard).toHaveProperty('revenueImpact');
    expect(dashboard.suggestedPricing).toHaveProperty('base');
    expect(dashboard.marketPosition).toHaveProperty('marketAvg');
    expect(Array.isArray(dashboard.explanation)).toBe(true);
    expect(Array.isArray(dashboard.alerts)).toBe(true);
    expect(dashboard.alerts).toContain('HIGH: Competitor moved 8%. (x2)');
    expect(dashboard.alerts).toContain('MEDIUM: OTA parity drifted 5%.');
    expect(
      dashboard.alerts.some((line) => String(line).includes('Demand surge window detected within 3 days.')),
    ).toBe(false);
    expect(Array.isArray(dashboard.alertGroups)).toBe(true);
    expect(dashboard.alertGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'HIGH', message: 'Competitor moved 8%.', count: 2 }),
        expect.objectContaining({ severity: 'MEDIUM', message: 'OTA parity drifted 5%.', count: 1 }),
      ]),
    );
    expect(Array.isArray(dashboard.competitiveGrid)).toBe(true);
    expect(Array.isArray(dashboard.forwardCurve)).toBe(true);
    expect(Array.isArray(dashboard.otaParity.rows)).toBe(true);
    expect(dashboard.confidence).toHaveProperty('forecastAccuracy60d');
    expect(dashboard.confidence).toHaveProperty('volatilityError');
    expect(dashboard.signalBreakdown).toHaveProperty('eventImpact');
    expect(dashboard.revenueImpact.maintain).toBeGreaterThan(0);
    expect(dashboard.revenueImpact.plus2).toBeGreaterThan(0);
    expect(dashboard.revenueImpact.minus2).toBeGreaterThan(0);
    expect(['maintain', 'plus2', 'minus2']).toContain(dashboard.revenueImpact.recommended);
    expect(dashboard.revenueImpact.basis).toEqual(
      expect.objectContaining({
        assumedRooms: expect.any(Number),
        roomNights: expect.any(Number),
        baselineOccupancy: expect.any(Number),
        adrUsed: expect.any(Number),
      }),
    );
    expect(dashboard.dataHealth.diagnostics.pipeline).toEqual(
      expect.objectContaining({
        ota: expect.objectContaining({ snapshotRows: 4, matchedChannelRows: 1 }),
        events: expect.objectContaining({ cityRows: 2, ingestedRows: 1 }),
        freshness: expect.objectContaining({
          competitorScrapeAt: '2026-03-10T00:00:00.000Z',
        }),
      }),
    );
    expect(evaluateAlerts).toHaveBeenCalledTimes(1);
  });

  test('forces product lock when output-integrity guard finds stale surge alerts', async () => {
    const nowIso = new Date().toISOString();
    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Mumbai',
        hotel_name: 'Marine Drive Grand',
        alert_sensitivity: 'balanced',
        room_count: 52,
      }),
      getLatestMarketCheckinDate: async () => ({
        checkin_date: '2026-03-14',
        observed_at: nowIso,
        hotel_rows: 1,
      }),
      getCompetitorRatesForHotel: async () => [
        { id: 'c1', competitor_name: 'Trident Nariman Point', price_today: 18000, price_48h_ago: 17200 },
        { id: 'c2', competitor_name: 'The St. Regis Mumbai', price_today: 18800, price_48h_ago: 18000 },
        { id: 'ota1', competitor_name: 'Booking.com', price_today: 18600, price_48h_ago: 17900 },
        { id: 'ota2', competitor_name: 'Agoda', price_today: 18500, price_48h_ago: 17850 },
      ],
      getLatestHotelPrice: async () => 17850,
      getLatestCompetitorScrapeAt: async () => nowIso,
      getAirfareSeries: async () => buildAirfareSeries(),
      getUpcomingHolidays: async () => [],
      getUpcomingEvents: async () => [
        {
          event_name: 'BKC Corporate Summit',
          city: 'Mumbai',
          start_date: '2026-03-19',
          end_date: '2026-03-20',
          category: 'conference',
          scale: 'large',
          impact_score: 12,
          scraped_at: nowIso,
        },
      ],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      getLatestDemandScore: async () => null,
      getPreviousDemandScore: async () => null,
      insertDemandScore: async (payload) => ({
        id: 987,
        demand_score: payload.demandScore,
        level: payload.level,
        recommendation: payload.recommendation,
        confidence: payload.confidence,
        explanation: payload.explanation,
        market_position: payload.marketPosition,
        signals: payload.signals,
        created_at: nowIso,
      }),
      listActiveAlerts: async () => [
        {
          severity: 'critical',
          alert_type: 'surge_window',
          message: 'Demand surge window detected within 3 days.',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      evaluateAlerts: async () => ({ created: [], skipped: 0 }),
      getMockCompetitorRates: async () => [],
      getCalibration: async () => ({
        global: {
          thresholds: { otaParityParityBand: 2, otaParityGap: 5 },
          dataHealth: {
            minSampleForAccuracy: 0,
            minForecastAccuracy: 0,
            minEventRowsFocusCity: 1,
            minOtaLiveRowsForAction: 1,
          },
        },
      }),
      getPerformance: async () => ({
        direction_accuracy: 88,
        alert_precision: 82,
        position_improvement_pct: 6,
        rolling_accuracy_30d: 84,
        stability_deviation: 8,
        sample_size: 12,
      }),
      getValidatedPerformance: async () => ({
        direction_accuracy: 88,
        rolling_accuracy_30d: 84,
        stability_deviation: 8,
        sample_size: 12,
        directionSamples: 12,
      }),
      touchHotelCalculatedAt: async () => null,
    };

    const dashboard = await recalculateDashboard('11111111-1111-4111-8111-111111111111', {}, deps);
    expect(dashboard.outputGuard).toEqual(
      expect.objectContaining({
        blocked: true,
      }),
    );
    expect(dashboard.signalQuality.mode).toBe('verify');
    expect(dashboard.productLock.enabled).toBe(true);
    expect(dashboard.productLock.reason).toContain('stale surge alert');
  });

  test('disables product lock when forceProductUnlock override is enabled', async () => {
    const nowIso = new Date().toISOString();
    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Mumbai',
        hotel_name: 'Marine Drive Grand',
        alert_sensitivity: 'balanced',
        room_count: 52,
      }),
      getLatestMarketCheckinDate: async () => ({
        checkin_date: '2026-03-14',
        observed_at: nowIso,
        hotel_rows: 1,
      }),
      getCompetitorRatesForHotel: async () => [
        { id: 'c1', competitor_name: 'Trident Nariman Point', price_today: 18000, price_48h_ago: 17200 },
        { id: 'c2', competitor_name: 'The St. Regis Mumbai', price_today: 18800, price_48h_ago: 18000 },
      ],
      getLatestHotelPrice: async () => 17850,
      getLatestCompetitorScrapeAt: async () => nowIso,
      getAirfareSeries: async () => buildAirfareSeries(),
      getUpcomingHolidays: async () => [],
      getUpcomingEvents: async () => [],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      getLatestDemandScore: async () => null,
      getPreviousDemandScore: async () => null,
      insertDemandScore: async (payload) => ({
        id: 988,
        demand_score: payload.demandScore,
        level: payload.level,
        recommendation: payload.recommendation,
        confidence: payload.confidence,
        explanation: payload.explanation,
        market_position: payload.marketPosition,
        signals: payload.signals,
        created_at: nowIso,
      }),
      listActiveAlerts: async () => [
        {
          severity: 'critical',
          alert_type: 'surge_window',
          message: 'Demand surge window detected within 3 days.',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      evaluateAlerts: async () => ({ created: [], skipped: 0 }),
      getMockCompetitorRates: async () => [],
      getCalibration: async () => ({
        global: {
          thresholds: { otaParityParityBand: 2, otaParityGap: 5 },
          dataHealth: {
            forceProductUnlock: true,
          },
        },
      }),
      getPerformance: async () => ({
        direction_accuracy: 40,
        alert_precision: 40,
        position_improvement_pct: 0,
        rolling_accuracy_30d: 0,
        stability_deviation: 40,
        sample_size: 0,
      }),
      getValidatedPerformance: async () => ({
        direction_accuracy: 40,
        rolling_accuracy_30d: 0,
        stability_deviation: 40,
        sample_size: 0,
        directionSamples: 0,
      }),
      touchHotelCalculatedAt: async () => null,
    };

    const dashboard = await recalculateDashboard('11111111-1111-4111-8111-111111111111', {}, deps);
    expect(dashboard.signalQuality.forceUnlocked).toBe(true);
    expect(dashboard.productLock.enabled).toBe(false);
    expect(dashboard.productLock.reason).toContain('Permanent product unlock override');
  });

  test('falls back to neutral behavior when competitor and airfare are missing', async () => {
    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Goa',
        hotel_name: 'Hotel Taj Goa',
        alert_sensitivity: 'balanced',
        room_count: 20,
      }),
      getCompetitorRatesForHotel: async () => [],
      getMockCompetitorRates: async () => [],
      getLatestHotelPrice: async () => 11700,
      getAirfareSeries: async () => [],
      getUpcomingHolidays: async () => [],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      getLatestDemandScore: async () => null,
      insertDemandScore: async (payload) => ({
        demand_score: payload.demandScore,
        level: payload.level,
        recommendation: payload.recommendation,
        explanation: payload.explanation,
        market_position: payload.marketPosition,
        signals: payload.signals,
      }),
      listActiveAlerts: async () => [],
      evaluateAlerts: async () => ({ created: [], skipped: 0 }),
    };

    const dashboard = await recalculateDashboard('11111111-1111-4111-8111-111111111111', {}, deps);
    expect(dashboard.suggestedPricing.base).toBeGreaterThan(0);
    expect(dashboard.suggestedPricing.bands.safe.min).toBeGreaterThan(0);
    expect(dashboard.revenueImpact.maintain).toBeGreaterThan(0);
    expect(dashboard.explanation.join(' ')).toContain('neutral');
  });

  test('normalizes legacy formatted prices and prevents zero revenue projections', async () => {
    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Goa',
        hotel_name: 'Hotel Taj Goa',
        alert_sensitivity: 'balanced',
        room_count: 48,
      }),
      getLatestDemandScore: async () => ({
        id: 123,
        demand_score: 62.64,
        level: 'Moderate',
        recommendation: {
          base: '₹8,150',
          bands: {
            safe: { min: '₹7,900', max: '₹8,400' },
            aggressive: { min: '₹8,400', max: '₹8,800' },
            premium: { min: '₹9,850', max: '₹10,900' },
          },
          riskLevel: 'Low',
          marketHeat: '4',
          action: 'maintain',
        },
        confidence: 88,
        explanation: ['Legacy snapshot normalization test'],
        market_position: {
          hotelPrice: '₹6,689',
          marketAvg: '₹10,362',
          positionPct: '-35.45',
        },
        signals: {
          competitor: { score: 58, confidence: 88, avgChangePct: 3.6, direction: 'up', reason: 'up' },
          holiday: { score: 53, confidence: 80, reason: 'holiday', eventShare: 0.3, eventCategoryShare: {} },
          airfare: { score: 51, confidence: 70, reason: 'airfare' },
          season: { score: 66, confidence: 92, reason: 'season' },
        },
        created_at: '2026-03-01T00:00:00.000Z',
      }),
      getLatestMarketCheckinDate: async () => ({
        checkin_date: '2026-03-16',
        observed_at: '2026-03-01T00:00:00.000Z',
        hotel_rows: 1,
      }),
      getCompetitorRatesForHotel: async () => [
        { id: 'c1', competitor_name: 'A', price_today: 12000, price_48h_ago: 11800 },
        { id: 'c2', competitor_name: 'B', price_today: 11850, price_48h_ago: 11700 },
      ],
      getLatestHotelPrice: async () => '₹6,689',
      getLatestCompetitorScrapeAt: async () => '2026-03-01T00:00:00.000Z',
      getAirfareSeries: async () => buildAirfareSeries(),
      getUpcomingHolidays: async () => [],
      getUpcomingEvents: async () => [],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      listActiveAlerts: async () => [],
      getCalibration: async () => null,
      getPreviousDemandScore: async () => null,
      getCanaryOverride: async () => null,
      getPerformance: async () => ({
        direction_accuracy: 70,
        alert_precision: 75,
        position_improvement_pct: 5,
        rolling_accuracy_30d: 68,
        stability_deviation: 12,
        sample_size: 9,
      }),
      getValidatedPerformance: async () => null,
    };

    const dashboard = await getDashboard('11111111-1111-4111-8111-111111111111', {}, deps);
    expect(dashboard.suggestedPricing.base).toBeGreaterThan(0);
    expect(dashboard.marketPosition.hotelPrice).toBeGreaterThan(0);
    expect(dashboard.marketPosition.marketAvg).toBeGreaterThan(0);
    expect(dashboard.revenueImpact.available).toBe(true);
    expect(dashboard.revenueImpact.maintain).toBeGreaterThan(0);
    expect(dashboard.revenueImpact.plus2).toBeGreaterThan(0);
    expect(dashboard.revenueImpact.minus2).toBeGreaterThan(0);
  });

  test('returns unavailable revenue impact when no ADR basis exists', async () => {
    const deps = {
      getHotelById: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        city: 'Goa',
        hotel_name: 'Hotel Taj Goa',
        alert_sensitivity: 'balanced',
        room_count: 48,
      }),
      getLatestDemandScore: async () => null,
      getLatestMarketCheckinDate: async () => ({
        checkin_date: '2026-03-16',
        observed_at: new Date().toISOString(),
        hotel_rows: 0,
      }),
      getCompetitorRatesForHotel: async () => [],
      getLatestHotelPrice: async () => 0,
      getLatestCompetitorScrapeAt: async () => new Date().toISOString(),
      getAirfareSeries: async () => buildAirfareSeries(),
      getUpcomingHolidays: async () => [],
      getUpcomingEvents: async () => [],
      getCityWeights: async () => ({
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      }),
      insertDemandScore: async (payload) => ({
        demand_score: payload.demandScore,
        level: payload.level,
        recommendation: payload.recommendation,
        explanation: payload.explanation,
        market_position: payload.marketPosition,
        signals: payload.signals,
      }),
      listActiveAlerts: async () => [],
      evaluateAlerts: async () => ({ created: [], skipped: 0 }),
      getMockCompetitorRates: async () => [],
      getCalibration: async () => null,
      getPreviousDemandScore: async () => null,
      getCanaryOverride: async () => null,
      getPerformance: async () => ({
        direction_accuracy: 70,
        alert_precision: 75,
        position_improvement_pct: 5,
        rolling_accuracy_30d: 68,
        stability_deviation: 12,
        sample_size: 9,
      }),
      getValidatedPerformance: async () => null,
    };

    const dashboard = await recalculateDashboard('11111111-1111-4111-8111-111111111111', {}, deps);
    expect(dashboard.revenueImpact.available).toBe(false);
    expect(dashboard.revenueImpact.maintain).toBe(0);
    expect(dashboard.revenueImpact.plus2).toBe(0);
    expect(dashboard.revenueImpact.minus2).toBe(0);
  });
});
