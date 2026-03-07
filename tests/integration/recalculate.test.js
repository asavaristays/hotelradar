import { jest } from '@jest/globals';
import { recalculateDashboard } from '../../src/services/dashboardService.js';

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
        { severity: 'high', message: 'Competitor moved 8%.' },
        { severity: 'high', message: 'Competitor moved 8%.' },
        { severity: 'medium', message: 'OTA parity drifted 5%.' },
      ],
      evaluateAlerts,
      getMockCompetitorRates: async () => [],
    };

    const dashboard = await recalculateDashboard('11111111-1111-4111-8111-111111111111', {}, deps);

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
    expect(dashboard).toHaveProperty('performanceSummary');
    expect(dashboard).toHaveProperty('revenueImpact');
    expect(dashboard.suggestedPricing).toHaveProperty('base');
    expect(dashboard.marketPosition).toHaveProperty('marketAvg');
    expect(Array.isArray(dashboard.explanation)).toBe(true);
    expect(Array.isArray(dashboard.alerts)).toBe(true);
    expect(dashboard.alerts).toContain('HIGH: Competitor moved 8%. (x2)');
    expect(dashboard.alerts).toContain('MEDIUM: OTA parity drifted 5%.');
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
    expect(evaluateAlerts).toHaveBeenCalledTimes(1);
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
});
