import { getMarketDemand, scoreMarketDemandEvidence } from '../src/services/marketDemandService.js';

describe('marketDemandService', () => {
  test('marks event-only demand as review only instead of increasing price', () => {
    const [day] = scoreMarketDemandEvidence([
      {
        stay_date: '2026-05-25',
        iso_dow: 6,
        competitor_rate_rows: 0,
        competitor_count: 0,
        market_avg_price: null,
        market_avg_price_48h_ago: null,
        competitor_last_scraped_at: null,
        hotel_rate_rows: 1,
        hotel_count: 1,
        hotel_avg_price: 9000,
        hotel_rate_last_captured_at: '2026-05-25T08:00:00.000Z',
        event_impact_score: 35,
        events: [
          {
            event_name: 'Goa Music Festival',
            category: 'festival',
            scale: 'large',
            confidence: 'confirmed',
            scraped_at: '2026-05-25T08:00:00.000Z',
          },
        ],
        holidays: [],
        airfare_observed_date: '2026-05-25',
        airfare_change_pct: 12,
        computed_at: '2026-05-25T09:00:00.000Z',
      },
    ]);

    expect(day.demand_score).toBeGreaterThan(45);
    expect(day.trust_status).toBe('insufficient_data');
    expect(day.pricing_action).toBe('Review Only');
    expect(day.price_adjustment_pct).toBe(0);
  });

  test('returns increase when fresh competitor evidence supports price movement', () => {
    const [day] = scoreMarketDemandEvidence([
      {
        stay_date: '2026-05-26',
        iso_dow: 6,
        competitor_rate_rows: 12,
        competitor_count: 4,
        market_avg_price: 12000,
        market_avg_price_48h_ago: 10800,
        competitor_last_scraped_at: '2026-05-25T08:00:00.000Z',
        hotel_rate_rows: 1,
        hotel_count: 1,
        hotel_avg_price: 10200,
        hotel_rate_last_captured_at: '2026-05-25T08:05:00.000Z',
        event_impact_score: 22,
        events: [
          {
            event_name: 'Mumbai Business Summit',
            category: 'conference',
            scale: 'large',
            confidence: 'confirmed',
            scraped_at: '2026-05-25T08:00:00.000Z',
          },
        ],
        holidays: [],
        airfare_observed_date: '2026-05-25',
        airfare_change_pct: 8,
        computed_at: '2026-05-25T09:00:00.000Z',
      },
    ]);

    expect(day.trust_status).toBe('actionable');
    expect(['Increase', 'Strong Increase']).toContain(day.pricing_action);
    expect(day.price_adjustment_pct).toBeGreaterThan(0);
  });

  test('returns scoped payload and documents removed datasets', async () => {
    const payload = await getMarketDemand(
      'Goa',
      { horizonDays: 1 },
      {
        listMarketDemandEvidence: async () => [
          {
            stay_date: '2026-05-25',
            iso_dow: 1,
            competitor_rate_rows: 0,
            competitor_count: 0,
            events: [],
            holidays: [],
            computed_at: '2026-05-25T09:00:00.000Z',
          },
        ],
      },
    );

    expect(payload.city).toBe('Goa');
    expect(payload.days).toHaveLength(1);
    expect(payload.removed_from_price_action).toContain('Lead/prospecting signals');
  });
});
