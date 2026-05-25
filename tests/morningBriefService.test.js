import { getMorningBriefForUser } from '../src/services/morningBriefService.js';

describe('morningBriefService', () => {
  test('builds a compact daily brief from existing intelligence layers', async () => {
    const payload = await getMorningBriefForUser(
      { id: 'user-1', role: 'hotel_user', hotels: ['hotel-1'] },
      {
        getHotelById: async () => ({
          id: 'hotel-1',
          city: 'Goa',
        }),
        getDashboard: async () => ({
          demandLevel: 'High',
          suggestedPricing: {
            base: 9200,
          },
          marketPosition: {
            hotelPrice: 7800,
          },
          confidence: {
            score: 84,
          },
          lastUpdated: '2026-03-17T05:45:00.000Z',
        }),
        getCompetitorIntelligenceForUser: async () => ({
          competitors: [
            { hotel_name: 'Comp A', review_activity_signal: true },
            { hotel_name: 'Comp B', review_activity_signal: true },
            { hotel_name: 'Comp C', review_activity_signal: true },
            { hotel_name: 'Comp D', review_activity_signal: false },
          ],
        }),
        getMarketOpportunityFeed: async () => ({
          opportunities: [
            {
              title: 'Demand Surge Cluster',
              description: 'Demand surge in Calangute area',
            },
          ],
        }),
      },
    );

    expect(payload).toEqual({
      city: 'Goa',
      market_demand: 'Strong',
      recommended_price: 9200,
      current_price: 7800,
      confidence: 84,
      competitor_alert: '3 nearby hotels showing strong review activity',
      top_opportunity: 'Demand surge in Calangute area',
      generated_at: '2026-03-17',
      verification: {
        status: 'verified',
        label: 'Checked twice before display',
        pass_count: 4,
        checks: [
          { key: 'hotel_context', label: 'Hotel context', passed: true },
          { key: 'dashboard_snapshot', label: 'Dashboard snapshot', passed: true },
          { key: 'competitor_signal', label: 'Competitor signal', passed: true },
          { key: 'opportunity_signal', label: 'Opportunity signal', passed: true },
        ],
        checked_at: expect.any(String),
      },
    });
  });

  test('strips hotel-specific focus area copy from top opportunity text', async () => {
    const payload = await getMorningBriefForUser(
      { id: 'user-2', role: 'hotel_user', hotels: ['hotel-2'] },
      {
        getHotelById: async () => ({
          id: 'hotel-2',
          city: 'Mumbai',
        }),
        getDashboard: async () => ({
          demandLevel: 'Moderate',
          suggestedPricing: {
            base: 18050,
          },
          marketPosition: {
            hotelPrice: 17850,
          },
          confidence: {
            score: 80,
          },
          lastUpdated: '2026-03-15T01:31:00.000Z',
        }),
        getCompetitorIntelligenceForUser: async () => ({
          competitors: [],
        }),
        getMarketOpportunityFeed: async () => ({
          opportunities: [
            {
              signal_type: 'OTA_DEPENDENCE',
              title: 'OTA Dependence',
              description:
                'The hotel looks visible in-market but may still be overly reliant on OTA demand. Focus area: Royal Garden Resort.',
            },
          ],
        }),
      },
    );

    expect(payload.top_opportunity).toBe(
      'The hotel looks visible in-market but may still be overly reliant on OTA demand.',
    );
  });

  test('marks a brief for review when not enough checks pass', async () => {
    const payload = await getMorningBriefForUser(
      { id: 'user-3', role: 'hotel_user', hotels: ['hotel-3'] },
      {
        getHotelById: async () => ({
          id: 'hotel-3',
          city: 'Pune',
        }),
        getDashboard: async () => ({
          demandLevel: 'Low',
          suggestedPricing: {
            base: 0,
          },
          marketPosition: {
            hotelPrice: 0,
          },
          confidence: {
            score: 0,
          },
        }),
        getCompetitorIntelligenceForUser: async () => ({
          competitors: [],
        }),
        getMarketOpportunityFeed: async () => ({
          opportunities: [],
        }),
      },
    );

    expect(payload.verification.status).toBe('review');
    expect(payload.verification.pass_count).toBe(1);
  });
});
