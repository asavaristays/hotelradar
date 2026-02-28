import { average, clamp, percentChange, round, stdDev } from '../../utils/math.js';

const cityBenchmarks = {
  Goa: 5500,
  Mumbai: 4200,
  Jodhpur: 4800,
  Pushkar: 4700,
  Jawai: 5200,
  Jaipur: 5100,
  Nainital: 5400,
  Corbett: 5700,
  Mukeshwar: 5600,
  Mukteshwar: 5600,
};

/**
 * Compute enhanced airfare demand signal with trend, price level and stability penalty.
 * @param {{city:string,series:Array<{date:string,avg_price:number}>}} input
 * @returns {{score:number,changePct:number,volatilityPct:number,confidence:number,reason:string,neutral:boolean}}
 */
export function computeEnhancedAirfareSignal(input) {
  const city = input.city;
  const series = (input.series || []).map((row) => Number(row.avg_price)).filter((n) => Number.isFinite(n) && n > 0);

  if (series.length < 7) {
    return {
      score: 50,
      changePct: 0,
      volatilityPct: 0,
      confidence: 55,
      reason: 'Airfare trend data is limited; neutral demand contribution applied.',
      neutral: true,
    };
  }

  const avg7 = average(series.slice(0, 7));
  const baseline14 = average(series.slice(7, 21));
  const changePct = percentChange(avg7, baseline14 || avg7);
  const neutralTrend = Math.abs(changePct) <= 5;

  const benchmark = cityBenchmarks[city] || average(series);
  const priceLevelPct = percentChange(avg7, benchmark || avg7);

  const volWindow = series.slice(0, Math.min(14, series.length));
  const volatilityPct = (stdDev(volWindow) / (average(volWindow) || 1)) * 100;
  const instabilityPenalty = clamp((volatilityPct - 8) * 1.5, 0, 18);

  const trendComponent = neutralTrend ? 0 : changePct;
  const rawScore = 50 + trendComponent * 1.6 + priceLevelPct * 0.6 - instabilityPenalty;
  const score = clamp(rawScore, 0, 100);

  const reasonBits = neutralTrend
    ? ['Airfare trend is within neutral zone (±5%); no strong demand signal.']
    : [`Airfare moved ${round(changePct)}% vs 14-day baseline.`];
  if (Math.abs(priceLevelPct) >= 10) {
    reasonBits.push(`Absolute airfare level is ${round(priceLevelPct)}% vs city norm.`);
  }
  if (instabilityPenalty > 0) {
    reasonBits.push(`Signal stability penalty applied (${round(instabilityPenalty)} pts).`);
  }

  return {
    score: round(score),
    changePct: round(changePct),
    volatilityPct: round(volatilityPct),
    confidence: round(clamp(92 - instabilityPenalty, 55, 95)),
    reason: reasonBits.join(' '),
    neutral: false,
  };
}
