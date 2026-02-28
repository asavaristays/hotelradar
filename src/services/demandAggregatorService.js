import { getCityWeights } from '../repositories/marketRepository.js';
import { classifyDemandScore, recommendationForLevel } from './classificationService.js';
import { clamp, round2 } from '../utils/math.js';

export async function aggregateDemand(city, signals) {
  const weights = await getCityWeights(city);
  if (!weights) {
    throw new Error(`Missing city weight configuration for ${city}`);
  }

  const finalScore =
    Number(signals.competitor.score) * Number(weights.competitor_weight) +
    Number(signals.holiday.score) * Number(weights.holiday_weight) +
    Number(signals.airfare.score) * Number(weights.airfare_weight) +
    Number(signals.season.score) * Number(weights.season_weight);

  const score = round2(clamp(finalScore, 0, 100));
  const level = classifyDemandScore(score);
  const recommendation = recommendationForLevel(level);

  const confidence = round2(
    clamp(
      (signals.competitor.completeness +
        signals.holiday.completeness +
        signals.airfare.completeness +
        signals.season.completeness) /
        4,
      0,
      100,
    ),
  );

  return { score, level, recommendation, confidence, weights };
}
