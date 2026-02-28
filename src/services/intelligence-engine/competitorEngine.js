import { logger } from '../../config/logger.js';
import { round } from '../../utils/math.js';
import { normalizeCompetitorMomentum } from './competitorMomentumNormalizer.js';

/**
 * Compute competitor momentum score using normalized 48h and 7d trend deltas.
 * @param {Array<{id: string, competitor_name?:string, price_today: number, price_48h_ago: number, price_7d_ago?:number}>} competitors
 * @returns {{score:number,avgChangePct:number,direction:'up'|'stable'|'down',reason:string,confidence:number,neutral:boolean,outlierCount:number}}
 */
export function computeCompetitorScore(competitors = []) {
  logger.info('engine_input', { engine: 'competitor', rows: competitors.length });

  const normalized = normalizeCompetitorMomentum(competitors);
  const neutral = competitors.length === 0;

  let reason;
  if (neutral) {
    reason = 'Competitor pricing data unavailable; using neutral competitor signal.';
  } else {
    const directionSentence =
      normalized.direction === 'up'
        ? `Competitor average increased ${round(normalized.avgChangePct)}% in last 48 hours.`
        : normalized.direction === 'down'
          ? `Competitor average decreased ${Math.abs(round(normalized.avgChangePct))}% in last 48 hours.`
          : `Competitor movement is stable at ${round(normalized.avgChangePct)}% over 48 hours.`;

    const outlierSentence =
      normalized.outlierCount > 0
        ? `Filtered ${normalized.outlierCount} outlier rate jump(s) above 30%.`
        : 'No competitor outliers detected.';

    reason = `${directionSentence} ${outlierSentence}`;
  }

  const output = {
    score: normalized.score,
    avgChangePct: normalized.avgChangePct,
    direction: normalized.direction,
    reason,
    confidence: normalized.confidence,
    neutral,
    outlierCount: normalized.outlierCount,
  };

  logger.info('engine_output', { engine: 'competitor', ...output });
  return output;
}
