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
          {
            sourceType: 'official',
            signalType: 'hotel_rate',
            checkinDate: '2026-08-16',
            valueNumeric: 37200,
          },
          {
            sourceType: 'ota',
            signalType: 'ota_rate',
            checkinDate: '2026-08-16',
            valueNumeric: 35400,
          },
          {
            sourceType: 'competitor',
            signalType: 'competitor_rate',
            checkinDate: '2026-08-16',
            valueNumeric: 33100,
          },
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
    expect(model.enterpriseBrief).toEqual(
      expect.objectContaining({
        version: 'enterprise-revenue-intelligence-v1',
        horizonDays: 15,
        next15Days: expect.any(Array),
        proofContract: expect.any(Object),
      }),
    );
    expect(model.enterpriseBrief.next15Days).toHaveLength(15);
    expect(model.enterpriseBrief.next15Days[0]).toEqual(
      expect.objectContaining({
        tariff: 35400,
        tariffLabel: '₹35,400',
        marketTariff: 31400,
      }),
    );
    expect(model.enterpriseBrief.next15Days[1]).toEqual(
      expect.objectContaining({
        tariff: 37200,
        tariffLabel: '₹37,200',
        marketTariff: 34250,
        tariffEvidenceRows: 3,
      }),
    );
    expect(model.enterpriseBrief.priorityDates[0]).toEqual(
      expect.objectContaining({
        date: '2026-08-15',
        pressure: expect.stringMatching(/High/i),
      }),
    );
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
    expect(model.enterpriseBrief.next15Days).toHaveLength(15);
    expect(model.enterpriseBrief.decisionPosture).toBe('Evidence required');
    expect(model.enterpriseBrief.next15Days[0]).toEqual(
      expect.objectContaining({
        evidenceStatus: 'Rate proof pending',
        recommendedAction: expect.stringMatching(/complete rate proof/i),
      }),
    );
    expect(model.enterpriseBrief.hotelGap).toMatch(/official rate/i);
  });
});
