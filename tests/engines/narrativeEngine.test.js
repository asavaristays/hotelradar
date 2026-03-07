import { buildNarrative } from '../../src/services/intelligence-engine/narrativeEngine.js';

describe('narrativeEngine', () => {
  test('returns deterministic narrative fields', () => {
    const input = {
      demandScore: 63.22,
      demandLevel: 'Moderate',
      signalBreakdown: {
        competitorMomentum: 21,
        holidayImpact: 8,
        airfareImpact: 2,
        seasonImpact: 6,
      },
      compression: { compressionLevel: 'Moderate', scarcityScore: 58 },
      riskLevel: 'Medium',
      stabilityStatus: 'Stable',
      seasonProfile: 'Heritage Desert',
      marketPosition: { positionPct: -18.3 },
      suggestedPricing: { base: 14250 },
    };

    const result = buildNarrative(input);
    const secondRun = buildNarrative(input);

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('marketStory');
    expect(result).toHaveProperty('pricingRationale');
    expect(result).toHaveProperty('actionGuidance');
    expect(result).toEqual(secondRun);
  });

  test('uses human-readable strongest signal label in market story', () => {
    const input = {
      demandScore: 71.4,
      demandLevel: 'High',
      signalBreakdown: {
        competitorMomentum: 3,
        holidayImpact: 2,
        eventImpact: 9.5,
        airfareImpact: 1,
        seasonImpact: 1.2,
      },
      compression: { compressionLevel: 'High', scarcityScore: 72 },
      riskLevel: 'Medium',
      stabilityStatus: 'Stable',
      seasonProfile: 'Urban Business',
      marketPosition: { positionPct: -6.2 },
      suggestedPricing: { base: 18200 },
    };

    const result = buildNarrative(input);
    expect(result.marketStory).toContain('Event Impact');
    expect(result.marketStory).not.toContain('eventImpact');
  });
});
