import { clamp, round } from '../../utils/math.js';
import { getPerformance, upsertPerformance } from '../../repositories/performanceRepository.js';

function scoreDirectionAccuracy({ recommendationAction, competitorDirection }) {
  const action = recommendationAction || 'maintain';
  const direction = competitorDirection || 'stable';
  if (action === 'increase' && direction === 'up') return 100;
  if (action === 'reduce' && direction === 'down') return 100;
  if (action === 'maintain' && direction === 'stable') return 100;
  if (direction === 'stable') return 70;
  return 40;
}

function scoreAlertPrecision(alertCount, demandLevel) {
  if (!alertCount) return 80;
  if (demandLevel === 'Surge' && alertCount >= 1) return 95;
  if (demandLevel === 'High' && alertCount >= 1) return 88;
  if (demandLevel === 'Moderate' && alertCount > 2) return 55;
  return 75;
}

function scorePositionImprovement(positionPct, suggestedBase, marketAvg) {
  if (!marketAvg) return 0;
  const projected = ((Number(suggestedBase || 0) - marketAvg) / marketAvg) * 100;
  return clamp(Math.abs(positionPct) - Math.abs(projected), -100, 100);
}

/**
 * Update and return rolling performance metrics.
 * @param {{
 *   hotelId:string,
 *   recommendationAction:string,
 *   competitorDirection:string,
 *   alertCount:number,
 *   demandLevel:string,
 *   positionPct:number,
 *   suggestedBase:number,
 *   marketAvg:number,
 *   stabilityVolatility:number
 * }} input
 */
export async function updatePerformanceMetrics(input) {
  const previous = await getPerformance(input.hotelId);
  const previousSample = Number(previous?.sample_size || 0);
  const sampleSize = previousSample + 1;

  const directionAccuracy = scoreDirectionAccuracy(input);
  const alertPrecision = scoreAlertPrecision(input.alertCount, input.demandLevel);
  const positionImprovementPct = scorePositionImprovement(
    Number(input.positionPct || 0),
    Number(input.suggestedBase || 0),
    Number(input.marketAvg || 0),
  );
  const stabilityDeviation = clamp(Number(input.stabilityVolatility || 0), 0, 100);

  const rollingAccuracy30d = round(
    clamp(
      ((Number(previous?.rolling_accuracy_30d || 0) * previousSample) + directionAccuracy) / sampleSize,
      0,
      100,
    ),
    2,
  );

  const row = await upsertPerformance({
    hotelId: input.hotelId,
    directionAccuracy: round(directionAccuracy, 2),
    alertPrecision: round(alertPrecision, 2),
    positionImprovementPct: round(positionImprovementPct, 2),
    rollingAccuracy30d,
    stabilityDeviation: round(stabilityDeviation, 2),
    sampleSize,
  });

  return {
    directionAccuracy: Number(row.direction_accuracy),
    alertPrecision: Number(row.alert_precision),
    positionImprovementPct: Number(row.position_improvement_pct),
    rollingAccuracy30d: Number(row.rolling_accuracy_30d),
    stabilityDeviation: Number(row.stability_deviation),
    sampleSize: Number(row.sample_size),
    updatedAt: row.updated_at,
  };
}

