import {
  PHASE_ONE_MARKET_INTELLIGENCE_TAG,
  buildPhaseOneMarketIntelligenceScenario,
} from '../src/services/phaseOneMarketIntelligenceScenario.js';

describe('phaseOneMarketIntelligenceSeed', () => {
  test('builds structured Phase 1 intelligence for The Ten without Goa Tourism CSV dependency', () => {
    const scenario = buildPhaseOneMarketIntelligenceScenario({
      now: new Date('2026-08-14T05:30:00.000Z'),
    });

    expect(scenario.tag).toBe(PHASE_ONE_MARKET_INTELLIGENCE_TAG);
    expect(scenario.city).toBe('Goa');
    expect(scenario.hotelName).toBe('The Ten');
    expect(JSON.stringify(scenario).toLowerCase()).not.toContain('goa tourism');
    expect(JSON.stringify(scenario).toLowerCase()).not.toContain('.csv');

    const dates = scenario.stayDates.map((stayDate) => stayDate.checkinDate);
    expect(dates).toEqual(
      expect.arrayContaining([
        '2026-08-15',
        '2026-08-21',
        '2026-08-28',
        '2026-08-29',
      ]),
    );

    for (const stayDate of scenario.stayDates) {
      expect(stayDate.officialRate).toBeGreaterThan(0);
      expect(stayDate.marketMedian).toBeGreaterThan(0);
      expect(stayDate.otaRates.length).toBeGreaterThanOrEqual(3);
      expect(stayDate.competitorRates.length).toBeGreaterThanOrEqual(5);
      for (const [, rate] of [...stayDate.otaRates, ...stayDate.competitorRates]) {
        expect(rate).toBeGreaterThan(0);
      }
    }

    expect(scenario.events.map((event) => event.category)).toEqual(
      expect.arrayContaining(['holiday', 'conference', 'wedding']),
    );
  });
});
