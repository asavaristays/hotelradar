import { average, clamp, percentChange, round, stdDev } from '../../utils/math.js';

function levelFromScore(score) {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Medium';
  return 'Low';
}

function movementSeries(competitorRates) {
  return competitorRates
    .map((row) => {
      const today = Number(row.price_today || 0);
      const prev = Number(row.price_48h_ago || 0);
      return prev > 0 ? percentChange(today, prev) : null;
    })
    .filter((value) => Number.isFinite(value));
}

/**
 * Compute deterministic confidence score and factors.
 * @param {{
 *  competitorRates:Array<{price_today:number,price_48h_ago:number,scraped_at?:string}>,
 *  airfareSeries:Array<{avg_price:number}>,
 *  holidays:Array<unknown>,
 *  signals:{competitor:{score:number},holiday:{score:number},airfare:{score:number},season:{score:number}}
 * }} input
 * @returns {{level:'High'|'Medium'|'Low',score:number,factors:string[]}}
 */
export function computeDemandConfidence(input) {
  const competitorRates = Array.isArray(input.competitorRates) ? input.competitorRates : [];
  const airfareSeries = Array.isArray(input.airfareSeries) ? input.airfareSeries : [];
  const holidays = Array.isArray(input.holidays) ? input.holidays : [];
  const signals = input.signals || {};

  const completenessCompetitor = clamp((competitorRates.length / 4) * 100, 0, 100);
  const completenessAirfare = clamp((airfareSeries.length / 14) * 100, 0, 100);
  const completenessHoliday = Array.isArray(input.holidays) ? 100 : 40;
  const completeness = round(
    completenessCompetitor * 0.5 + completenessAirfare * 0.35 + completenessHoliday * 0.15,
    1,
  );

  const movements = movementSeries(competitorRates);
  const movementStd = stdDev(movements);
  const competitorConsistency = clamp(100 - movementStd * 8, 0, 100);

  const signalScores = [
    Number(signals.competitor?.score || 50),
    Number(signals.holiday?.score || 50),
    Number(signals.airfare?.score || 50),
    Number(signals.season?.score || 50),
  ];
  const bullish = signalScores.filter((score) => score >= 55).length;
  const bearish = signalScores.filter((score) => score <= 45).length;
  const agreement = round((Math.max(bullish, bearish) / signalScores.length) * 100, 1);

  const freshest = competitorRates
    .map((row) => (row.scraped_at ? Date.parse(row.scraped_at) : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  let freshness = 45;
  if (Number.isFinite(freshest)) {
    const ageHours = (Date.now() - freshest) / (1000 * 60 * 60);
    freshness = clamp(100 - ageHours * 4, 20, 100);
  }
  freshness = round(freshness, 1);

  const score = round(
    completeness * 0.35 + competitorConsistency * 0.25 + agreement * 0.25 + freshness * 0.15,
    0,
  );
  const bias = Number(
    input.calibration?.global?.confidence?.defaultBias ?? input.seasonProfileBias ?? 0,
  );
  const ceiling = Number(input.calibration?.global?.confidence?.ceiling ?? 95);
  const minScore = Number(input.calibration?.global?.confidence?.min ?? 45);
  const adjustedScore = round(clamp(score + bias, minScore, ceiling), 0);

  const factors = [];
  if (competitorConsistency >= 70) factors.push('Strong competitor consistency');
  if (holidays.length > 0) factors.push('Holiday signal confirmed');
  if (movementStd <= 3.5) factors.push('Low volatility');
  if (agreement >= 70) factors.push('Signal agreement is strong');
  if (completeness >= 75) factors.push('High data completeness');
  if (freshness >= 75) factors.push('Recent market data refresh');
  if (!factors.length) factors.push('Limited signal agreement');

  return {
    level: levelFromScore(adjustedScore),
    score: adjustedScore,
    factors: factors.slice(0, 3),
  };
}
