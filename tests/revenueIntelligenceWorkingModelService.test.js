import { buildRevenueIntelligenceWorkingModel } from '../src/services/revenueIntelligenceWorkingModelService.js';

describe('revenueIntelligenceWorkingModelService', () => {
  test('creates a beta readiness object with explicit 8.5 target and path to 10', () => {
    const model = buildRevenueIntelligenceWorkingModel({
      hotelId: 'hotel-1',
      city: 'Goa',
      marketContext: {
        checkinDate: '2026-08-15',
        importantDates: [{ date: '2026-08-15', label: 'Independence Day long weekend', type: 'holiday' }],
      },
      marketPosition: {
        hotelPrice: 35400,
        marketAvg: 31400,
        positionPct: 12.7,
      },
      signalQuality: {
        competitorRows: 4,
        otaLiveRows: 3,
        otaRows: 3,
      },
      realtimeSignals: {
        counts: {
          ota: 3,
          competitor: 4,
          event: 1,
          mice: 1,
          wedding: 1,
          fresh: 8,
          total: 10,
        },
        rows: [
          { sourceType: 'event', signalType: 'holiday', valueText: 'Independence Day long weekend' },
          { sourceType: 'mice', signalType: 'corporate_offsite', valueText: 'Corporate offsite watch' },
          { sourceType: 'wedding', signalType: 'destination_wedding', valueText: 'Wedding group watch' },
        ],
      },
      demandScore: 76,
      demandLevel: 'High',
    });

    expect(model.betaReadiness).toEqual(
      expect.objectContaining({
        targetScore: 8.5,
        scoreOutOf10: expect.any(Number),
        status: expect.any(String),
        pillars: expect.any(Array),
        nextToReachTen: expect.any(Array),
      }),
    );
    expect(model.betaReadiness.pillars.map((pillar) => pillar.key)).toEqual([
      'decision_contract',
      'source_health',
      'client_story',
      'commercial_actionability',
      'automation_loop',
    ]);
    expect(model.betaReadiness.nextToReachTen.join(' ')).toMatch(/PMS|OTA|Digital asset/i);
  });

  test('keeps missing official rate as not captured and blocks strong action', () => {
    const model = buildRevenueIntelligenceWorkingModel({
      hotelId: 'hotel-1',
      city: 'Goa',
      marketContext: {
        checkinDate: '2026-08-15',
      },
      marketPosition: {
        hotelPrice: null,
        marketAvg: null,
        positionPct: null,
      },
      signalQuality: {
        competitorRows: 0,
        otaLiveRows: 0,
        otaRows: 0,
      },
      realtimeSignals: {
        counts: {
          fresh: 0,
          total: 0,
        },
        rows: [],
      },
      demandScore: 78,
      demandLevel: 'High',
    });

    const officialRate = model.evidence.find((item) => item.key === 'official_rate');
    const marketPrice = model.evidence.find((item) => item.key === 'market_price');

    expect(officialRate.status).toBe('missing');
    expect(officialRate.value).toBeNull();
    expect(marketPrice.status).toBe('missing');
    expect(marketPrice.value).toBeNull();
    expect(model.executiveSummary.pricingAction).toBe('Need More Data');
    expect(model.executiveSummary.trustStatus).toBe('needs_data');
  });
});
