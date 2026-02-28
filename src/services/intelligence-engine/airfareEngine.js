import { logger } from '../../config/logger.js';
import { computeEnhancedAirfareSignal } from './airfareDemandEnhancer.js';

/**
 * Compute airfare demand score using trend, absolute price level and stability penalties.
 * @param {{city:string,series:Array<{date:string,avg_price:number}>}} input
 * @returns {{score:number,changePct:number,volatilityPct:number,reason:string,confidence:number,neutral:boolean}}
 */
export function computeAirfareScore(input = {}) {
  logger.info('engine_input', {
    engine: 'airfare',
    city: input.city,
    points: (input.series || []).length,
  });

  const result = computeEnhancedAirfareSignal({
    city: input.city,
    series: input.series || [],
  });

  logger.info('engine_output', { engine: 'airfare', ...result });
  return result;
}
