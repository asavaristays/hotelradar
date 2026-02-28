import { average, clamp, round } from '../utils/math.js';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function demandIndexFromSignals(signals = {}) {
  const d7 = clamp(toNumber(signals.day7, 50), 0, 100);
  const d14 = clamp(toNumber(signals.day14, 50), 0, 100);
  const d30 = clamp(toNumber(signals.day30, 50), 0, 100);
  return round(d7 * 0.5 + d14 * 0.3 + d30 * 0.2, 2);
}

function occupancyProxy(demandIndex) {
  // Demand index is converted into a stable occupancy proxy for scenario simulation.
  return clamp(30 + demandIndex * 0.55, 20, 95);
}

function elasticityFactor(demandIndex) {
  // In high-demand windows, price increases hurt occupancy less; low-demand windows are more price-sensitive.
  if (demandIndex >= 70) return 0.35;
  if (demandIndex >= 50) return 0.55;
  return 0.8;
}

function volatilityAdjustmentFromSignals(signals = {}) {
  const points = [toNumber(signals.day7, 50), toNumber(signals.day14, 50), toNumber(signals.day30, 50)];
  const mean = average(points);
  const variance = average(points.map((value) => (value - mean) ** 2));
  const std = Math.sqrt(variance);
  // Multiplier <= 1.0; larger signal spread reduces projected confidence in revenue.
  return round(clamp(1 - std / 120, 0.75, 1), 3);
}

function scenarioModel({
  name,
  currentADR,
  competitorMedian,
  demandIndex,
  baseOccupancy,
  elasticity,
  volatilityAdjustment,
  priceChangePct,
  roomNights,
}) {
  const projectedADR = round(currentADR * (1 + priceChangePct), 2);
  const priceEffect = 1 - priceChangePct * elasticity;
  const competitorGapPct =
    competitorMedian > 0 ? ((projectedADR - competitorMedian) / competitorMedian) * 100 : 0;
  const competitionEffect = clamp(1 - Math.max(0, competitorGapPct) / 180, 0.7, 1.05);
  const demandEffect = clamp(0.85 + demandIndex / 200, 0.85, 1.35);

  const projectedOccupancy = clamp(
    baseOccupancy * priceEffect * competitionEffect * volatilityAdjustment * demandEffect,
    12,
    98,
  );

  const projectedRevenue = round(projectedADR * roomNights * (projectedOccupancy / 100), 2);

  return {
    scenario: name,
    projectedADR,
    projectedRevenue,
    volatilityAdjustment,
  };
}

/**
 * Simulate deterministic revenue impact for ADR scenarios.
 *
 * @example
 * const result = simulateRevenueImpact({
 *   currentADR: 8500,
 *   competitorMedian: 9000,
 *   demandSignals: { day7: 68, day14: 61, day30: 57 },
 *   roomNights: 100
 * });
 * // result.revenueScenarios => Maintain price / +2% price / -2% price
 *
 * @param {{
 *   currentADR:number,
 *   competitorMedian:number,
 *   demandSignals:{day7:number,day14:number,day30:number},
 *   roomNights?:number
 * }} input
 * @returns {{
 *   demandIndex:number,
 *   baselineOccupancy:number,
 *   volatilityAdjustment:number,
 *   revenueScenarios:Array<{
 *     scenario:'Maintain price'|'+2% price'|'-2% price',
 *     projectedADR:number,
 *     projectedRevenue:number,
 *     volatilityAdjustment:number
 *   }>
 * }}
 */
export function simulateRevenueImpact(input = {}) {
  const currentADR = Math.max(0, toNumber(input.currentADR, 0));
  const competitorMedian = Math.max(0, toNumber(input.competitorMedian, 0));
  const roomNights = Math.max(1, Math.floor(toNumber(input.roomNights, 100)));

  const demandIndex = demandIndexFromSignals(input.demandSignals || {});
  const baseOccupancy = occupancyProxy(demandIndex);
  const elasticity = elasticityFactor(demandIndex);
  const volatilityAdjustment = volatilityAdjustmentFromSignals(input.demandSignals || {});

  const revenueScenarios = [
    scenarioModel({
      name: 'Maintain price',
      currentADR,
      competitorMedian,
      demandIndex,
      baseOccupancy,
      elasticity,
      volatilityAdjustment,
      priceChangePct: 0,
      roomNights,
    }),
    scenarioModel({
      name: '+2% price',
      currentADR,
      competitorMedian,
      demandIndex,
      baseOccupancy,
      elasticity,
      volatilityAdjustment,
      priceChangePct: 0.02,
      roomNights,
    }),
    scenarioModel({
      name: '-2% price',
      currentADR,
      competitorMedian,
      demandIndex,
      baseOccupancy,
      elasticity,
      volatilityAdjustment,
      priceChangePct: -0.02,
      roomNights,
    }),
  ];

  return {
    demandIndex,
    baselineOccupancy: round(baseOccupancy, 2),
    volatilityAdjustment,
    revenueScenarios,
  };
}
