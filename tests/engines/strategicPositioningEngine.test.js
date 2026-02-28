import { computeStrategicPositioningIndex } from '../../src/services/strategicPositioningEngine.js';

describe('strategicPositioningEngine', () => {
  test('returns Strong Advantage for strong composite signal', () => {
    const output = computeStrategicPositioningIndex({
      positionPercent: -4,
      confidenceScore: 90,
      demandScore: 82,
      volatilityScore: 20,
      compressionScore: 75,
    });

    expect(output.spiScore).toBeGreaterThanOrEqual(70);
    expect(output.category).toBe('Strong Advantage');
    expect(output.components).toHaveProperty('weightedPosition');
  });

  test('returns Neutral for mixed signal profile', () => {
    const output = computeStrategicPositioningIndex({
      positionPercent: -30,
      confidenceScore: 60,
      demandScore: 55,
      volatilityScore: 55,
      compressionScore: 45,
    });

    expect(output.spiScore).toBeGreaterThanOrEqual(45);
    expect(output.spiScore).toBeLessThan(70);
    expect(output.category).toBe('Neutral');
  });

  test('returns Vulnerable for weak strategic profile', () => {
    const output = computeStrategicPositioningIndex({
      positionPercent: 35,
      confidenceScore: 35,
      demandScore: 30,
      volatilityScore: 85,
      compressionScore: 20,
    });

    expect(output.spiScore).toBeLessThan(45);
    expect(output.category).toBe('Vulnerable');
  });
});
