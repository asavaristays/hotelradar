import { clamp, round } from '../../utils/math.js';

function freshnessWeightFromHours(freshnessHours) {
  const hours = Number(freshnessHours);
  if (!Number.isFinite(hours) || hours < 0) return 40;
  return clamp(100 - (hours / 48) * 100, 0, 100);
}

function sourceWeightFromCount(sourceCount) {
  const count = Number(sourceCount);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return clamp((Math.min(count, 5) / 5) * 100, 0, 100);
}

function cancellationWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return clamp(numeric * 100, 0, 100);
  return clamp(numeric, 0, 100);
}

function confidenceLevel(score) {
  if (score > 80) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}

/**
 * Compute market confidence from normalized inputs.
 * @param {{date:string,normalized_rate:number,source_count:number,consistency_score:number,cancellation_match:number,freshness_hours:number}} input
 * @returns {{date:string,market_confidence:'High'|'Medium'|'Low',confidence_score:number}}
 */
export function computeMarketConfidenceIndex(input = {}) {
  const sourceWeight = sourceWeightFromCount(input.source_count);
  const freshnessWeight = freshnessWeightFromHours(input.freshness_hours);
  const consistencyScore = clamp(Number(input.consistency_score || 0), 0, 100);
  const cancellationMatch = cancellationWeight(input.cancellation_match);

  const confidenceScore = round(
    sourceWeight * 0.30 +
      freshnessWeight * 0.25 +
      consistencyScore * 0.25 +
      cancellationMatch * 0.20,
    2,
  );

  return {
    date: String(input.date || '').trim(),
    market_confidence: confidenceLevel(confidenceScore),
    confidence_score: confidenceScore,
  };
}

export function computeMarketConfidenceSeries(rows = []) {
  return rows.map((row) => computeMarketConfidenceIndex(row));
}
