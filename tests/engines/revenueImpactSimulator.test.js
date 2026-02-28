import { simulateRevenueImpact } from '../../src/services/revenueImpactSimulator.js';

describe('revenueImpactSimulator', () => {
  test('returns three deterministic scenarios with projected ADR and revenue', () => {
    const output = simulateRevenueImpact({
      currentADR: 10000,
      competitorMedian: 9800,
      demandSignals: { day7: 70, day14: 66, day30: 60 },
      roomNights: 100,
    });

    expect(output).toHaveProperty('revenueScenarios');
    expect(output.revenueScenarios).toHaveLength(3);

    const maintain = output.revenueScenarios.find((row) => row.scenario === 'Maintain price');
    const plus = output.revenueScenarios.find((row) => row.scenario === '+2% price');
    const minus = output.revenueScenarios.find((row) => row.scenario === '-2% price');

    expect(maintain.projectedADR).toBe(10000);
    expect(plus.projectedADR).toBe(10200);
    expect(minus.projectedADR).toBe(9800);
    expect(maintain.projectedRevenue).toBeGreaterThan(0);
    expect(output.volatilityAdjustment).toBeGreaterThanOrEqual(0.75);
    expect(output.volatilityAdjustment).toBeLessThanOrEqual(1);
  });
});
