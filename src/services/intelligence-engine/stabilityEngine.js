import { average, clamp, percentChange, round, stdDev } from '../../utils/math.js';

function statusFromVolatility(score) {
  if (score <= 35) return 'Stable';
  if (score <= 65) return 'Volatile';
  return 'Highly Volatile';
}

/**
 * Compute market stability index using movement volatility, price dispersion and direction consistency.
 * @param {{competitorRates:Array<{price_today:number,price_48h_ago:number}>}} input
 * @returns {{status:'Stable'|'Volatile'|'Highly Volatile',volatilityScore:number}}
 */
export function computeMarketStability(input) {
  const competitorRates = Array.isArray(input.competitorRates) ? input.competitorRates : [];

  if (!competitorRates.length) {
    return { status: 'Volatile', volatilityScore: 50 };
  }

  const movements = competitorRates
    .map((row) => {
      const today = Number(row.price_today || 0);
      const prev = Number(row.price_48h_ago || 0);
      return prev > 0 ? percentChange(today, prev) : null;
    })
    .filter((value) => Number.isFinite(value));

  const prices = competitorRates
    .map((row) => Number(row.price_today || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const stdMovement = stdDev(movements);
  const avgPrice = average(prices);
  const priceDispersion = avgPrice > 0 ? (stdDev(prices) / avgPrice) * 100 : 0;

  const signs = movements.map((value) => (value > 0 ? 1 : value < 0 ? -1 : 0));
  const majority = Math.max(
    signs.filter((value) => value === 1).length,
    signs.filter((value) => value === -1).length,
    signs.filter((value) => value === 0).length,
  );
  const consistencyPct = signs.length ? (majority / signs.length) * 100 : 50;
  const inconsistency = 100 - consistencyPct;

  const volatilityScore = round(
    clamp(stdMovement * 6 + priceDispersion * 2.2 + inconsistency * 0.5, 0, 100),
    1,
  );

  return {
    status: statusFromVolatility(volatilityScore),
    volatilityScore,
  };
}
