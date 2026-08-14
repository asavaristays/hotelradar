import {
  CENTRAL_INTELLIGENCE_CONTRACT,
  scoreCentralStayDateDecision,
} from '../src/services/centralIntelligenceService.js';
import { scoreCentralStayDateSeries } from '../src/services/centralIntelligenceService.js';
import { scoreMarketDemandEvidence } from '../src/services/marketDemandService.js';

const baseRow = {
  stay_date: '2026-08-02',
  iso_dow: 6,
  computed_at: '2026-08-01T09:00:00.000Z',
  competitor_last_scraped_at: '2026-08-01T08:00:00.000Z',
  hotel_rate_last_captured_at: '2026-08-01T08:00:00.000Z',
  events: [],
  holidays: [],
  airfare_observed_date: '2026-08-01',
  airfare_change_pct: 0,
};

function score(overrides = {}) {
  return scoreCentralStayDateDecision({ ...baseRow, ...overrides });
}

describe('centralIntelligenceService', () => {
  test('exports the approved action vocabulary', () => {
    expect(CENTRAL_INTELLIGENCE_CONTRACT.supported_actions).toEqual([
      'Need More Data',
      'Hold',
      'Watch',
      'Increase Watch',
      'Reduce Watch',
      'Increase',
      'Reduce',
      'Close Discount',
      'Minimum Stay',
      'Close Out',
    ]);
  });

  test('confidence below 40 returns Need More Data and keeps missing numeric values null', () => {
    const decision = score({
      competitor_rate_rows: 0,
      competitor_count: 0,
      market_avg_price: null,
      market_avg_price_48h_ago: null,
      competitor_last_scraped_at: null,
      hotel_rate_rows: 0,
      hotel_avg_price: null,
      hotel_rate_last_captured_at: null,
      ota_rate_rows: 0,
    });

    expect(decision.confidence_score).toBeLessThan(40);
    expect(decision.pricing_action).toBe('Need More Data');
    expect(decision.trust_status).toBe('insufficient_data');
    expect(decision.product_lock.locked).toBe(true);
    expect(decision.market_avg_price).toBeNull();
    expect(decision.hotel_avg_price).toBeNull();
    expect(decision.rate_change_pct).toBeNull();
    expect(decision.hotel_vs_market_pct).toBeNull();
    expect(decision.missing_evidence).toContain('Current hotel rate is not captured for this stay date.');
  });

  test('confidence 40-59 permits only Hold or Watch and blocks stale strong action', () => {
    const decision = score({
      competitor_rate_rows: 20,
      competitor_count: 5,
      market_avg_price: 11000,
      market_avg_price_48h_ago: 10000,
      competitor_last_scraped_at: '2026-07-29T08:00:00.000Z',
      hotel_rate_rows: 1,
      hotel_avg_price: 9000,
      ota_rate_rows: 2,
    });

    expect(decision.confidence_score).toBeGreaterThanOrEqual(40);
    expect(decision.confidence_score).toBeLessThan(60);
    expect(['Hold', 'Watch']).toContain(decision.pricing_action);
    expect(decision.product_lock.locked).toBe(true);
    expect(decision.product_lock.tier).toBe('watch_only');
    expect(decision.product_lock.permitted_actions).toEqual(['Hold', 'Watch']);
    expect(decision.product_lock.missing_requirements).toContain('fresh competitor observations');
    expect(decision.module_scores.data_health.critical_issues).toContain('stale_competitor_rates');
    expect(decision.freshness.competitor_rates.age_hours).toBeGreaterThan(36);
  });

  test('confidence 60-74 permits Increase Watch or Reduce Watch only', () => {
    const decision = score({
      competitor_rate_rows: 12,
      competitor_count: 3,
      market_avg_price: 12000,
      market_avg_price_48h_ago: 10800,
      hotel_rate_rows: 1,
      hotel_avg_price: 10200,
      ota_rate_rows: 1,
      event_impact_score: 0,
      events: [],
    });

    expect(decision.confidence_score).toBeGreaterThanOrEqual(60);
    expect(decision.confidence_score).toBeLessThan(75);
    expect(decision.pricing_action).toBe('Increase Watch');
    expect(decision.price_adjustment_pct).toBe(0);
    expect(decision.product_lock.locked).toBe(true);
    expect(decision.product_lock.permitted_actions).toEqual([
      'Hold',
      'Watch',
      'Increase Watch',
      'Reduce Watch',
    ]);
    expect(decision.product_lock.missing_requirements).toContain('2 OTA sources');
  });

  test('confidence 75+ still locks strong action when required evidence is missing', () => {
    const decision = score({
      competitor_rate_rows: 20,
      competitor_count: 5,
      market_avg_price: 11000,
      market_avg_price_48h_ago: 10000,
      hotel_rate_rows: 1,
      hotel_avg_price: 9000,
      ota_rate_rows: 2,
      normalization_valid: false,
    });

    expect(decision.confidence_score).toBeGreaterThanOrEqual(75);
    expect(decision.pricing_action).toBe('Increase Watch');
    expect(decision.product_lock.locked).toBe(true);
    expect(decision.product_lock.tier).toBe('strong_actions_blocked');
    expect(decision.product_lock.missing_requirements).toContain('valid normalization');
    expect(decision.module_scores.data_health.critical_issues).toContain('invalid_normalization');
  });

  test('confidence 75+ unlocks strong increase only when all required evidence is present', () => {
    const decision = score({
      competitor_rate_rows: 20,
      competitor_count: 5,
      market_avg_price: 11000,
      market_avg_price_48h_ago: 10000,
      hotel_rate_rows: 1,
      hotel_avg_price: 9000,
      ota_rate_rows: 2,
      normalization_valid: true,
    });

    expect(decision.confidence_score).toBeGreaterThanOrEqual(75);
    expect(decision.pricing_action).toBe('Increase');
    expect(decision.price_adjustment_pct).toBeGreaterThan(0);
    expect(decision.product_lock.locked).toBe(false);
    expect(decision.trust_status).toBe('actionable');
  });

  test('confidence 75+ unlocks strong reduce only when all required evidence is present', () => {
    const decision = score({
      competitor_rate_rows: 20,
      competitor_count: 5,
      market_avg_price: 10000,
      market_avg_price_48h_ago: 11000,
      hotel_rate_rows: 1,
      hotel_avg_price: 13000,
      ota_rate_rows: 2,
      normalization_valid: true,
    });

    expect(decision.confidence_score).toBeGreaterThanOrEqual(75);
    expect(decision.pricing_action).toBe('Reduce');
    expect(decision.price_adjustment_pct).toBeLessThan(0);
    expect(decision.product_lock.locked).toBe(false);
  });

  test('contradictory signals block strong action even at high confidence', () => {
    const decision = score({
      competitor_rate_rows: 20,
      competitor_count: 5,
      market_avg_price: 9500,
      market_avg_price_48h_ago: 10000,
      hotel_rate_rows: 1,
      hotel_avg_price: 10000,
      ota_rate_rows: 2,
      event_impact_score: 40,
      events: [
        {
          event_name: 'Goa Music Festival',
          category: 'festival',
          scale: 'large',
          confidence: 'confirmed',
        },
      ],
    });

    expect(decision.confidence_score).toBeGreaterThanOrEqual(75);
    expect(decision.contradictory_signals).toContain('Events indicate demand, but competitor prices are softening.');
    expect(decision.product_lock.locked).toBe(true);
    expect(decision.product_lock.missing_requirements).toContain('resolved contradiction check');
    expect(['Increase Watch', 'Reduce Watch', 'Watch']).toContain(decision.pricing_action);
  });

  test('classifies wedding demand inside Event Intelligence without bypassing product lock', () => {
    const decision = score({
      competitor_rate_rows: 0,
      competitor_count: 0,
      market_avg_price: null,
      hotel_rate_rows: 1,
      hotel_avg_price: 15000,
      ota_rate_rows: 0,
      event_impact_score: 18,
      events: [
        {
          event_name: 'Goa Destination Wedding Showcase',
          category: 'wedding_season',
          scale: 'large',
          confidence: 'confirmed',
        },
      ],
    });

    expect(decision.module_scores.event.wedding_event_count).toBe(1);
    expect(decision.module_scores.event.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'wedding',
          label: 'Wedding demand',
        }),
      ]),
    );
    expect(decision.top_drivers[0].evidence).toMatch(/wedding-led demand/i);
    expect(decision.pricing_action).toBe('Need More Data');
    expect(decision.product_lock.locked).toBe(true);
  });

  test('classifies MICE demand inside Event Intelligence without creating a separate final decision', () => {
    const decision = score({
      competitor_rate_rows: 12,
      competitor_count: 3,
      market_avg_price: 12000,
      market_avg_price_48h_ago: 11200,
      hotel_rate_rows: 1,
      hotel_avg_price: 10800,
      ota_rate_rows: 1,
      event_impact_score: 14,
      events: [
        {
          event_name: 'Jaipur MICE Expo and Corporate Summit',
          category: 'exhibition',
          scale: 'large',
          confidence: 'confirmed',
        },
      ],
    });

    expect(decision.central_intelligence.schema_version).toBe('central-intelligence-v1');
    expect(decision.module_scores.event.mice_event_count).toBe(1);
    expect(decision.module_scores.event.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'mice',
          label: 'MICE demand',
        }),
      ]),
    );
    expect(decision.module_scores.event.top_reasons[0]).toMatch(/MICE\/corporate demand/i);
    expect(['Increase Watch', 'Watch']).toContain(decision.pricing_action);
    expect(decision.product_lock.locked).toBe(true);
  });

  test('marketDemandService delegates scoring to Central Intelligence without changing final actions', () => {
    const rows = [
      {
        ...baseRow,
        competitor_rate_rows: 20,
        competitor_count: 5,
        market_avg_price: 11000,
        market_avg_price_48h_ago: 10000,
        hotel_rate_rows: 1,
        hotel_avg_price: 9000,
        ota_rate_rows: 2,
      },
    ];

    expect(scoreMarketDemandEvidence(rows)).toEqual(scoreCentralStayDateSeries(rows));
  });
});
