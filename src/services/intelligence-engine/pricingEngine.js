import { clamp, round } from '../../utils/math.js';

function roundToNearest50(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 50) * 50;
}

function normalizeBand(minValue, maxValue) {
  const min = roundToNearest50(minValue);
  const max = roundToNearest50(maxValue);
  return min <= max ? { min, max } : { min: max, max: min };
}

export function ensureOrderedBands(rawBands) {
  const MIN_SAFE_WIDTH = 300;
  const MIN_AGGRESSIVE_WIDTH = 500;
  const MIN_PREMIUM_WIDTH = 800;

  const safeSeed = normalizeBand(rawBands.safe.min, rawBands.safe.max);
  const safe = normalizeBand(safeSeed.min, Math.max(safeSeed.max, safeSeed.min + MIN_SAFE_WIDTH));
  const aggressiveSeed = normalizeBand(rawBands.aggressive.min, rawBands.aggressive.max);
  const premiumSeed = normalizeBand(rawBands.premium.min, rawBands.premium.max);

  const aggressiveMin = Math.max(aggressiveSeed.min, safe.max);
  const aggressiveMax = Math.max(aggressiveSeed.max, aggressiveMin + MIN_AGGRESSIVE_WIDTH);
  const aggressive = normalizeBand(aggressiveMin, aggressiveMax);

  const premiumMin = Math.max(premiumSeed.min, aggressive.max);
  const premiumMax = Math.max(premiumSeed.max, premiumMin + MIN_PREMIUM_WIDTH);
  const premium = normalizeBand(premiumMin, premiumMax);

  return { safe, aggressive, premium };
}

function heatFromScore(score) {
  if (score <= 20) return 1;
  if (score <= 40) return 2;
  if (score <= 60) return 3;
  if (score <= 80) return 4;
  return 5;
}

function strategyText(level, underpricedPct, city) {
  if (level === 'Moderate' && underpricedPct >= 20) {
    return `Moderate demand in ${city}; capture part of the underpricing gap.`;
  }
  if (level === 'Low') {
    return 'Low demand; stay close to current marketable price.';
  }
  if (level === 'High') {
    return 'High demand; close the market gap while preserving pace.';
  }
  if (level === 'Surge') {
    return `Surge demand in ${city}; move into premium capture zone.`;
  }
  return `${level} demand with controlled optimization.`;
}

/**
 * Compute deterministic prescriptive pricing.
 * @param {{
 *  demandScore:number,
 *  demandLevel:'Low'|'Moderate'|'High'|'Surge',
 *  hotelPrice:number,
 *  marketAvgPrice:number,
 *  competitorMomentum:{score:number,avgChangePct?:number,direction?:string},
 *  holidayScore:number,
 *  airfareScore:number,
 *  city:string
 * }} input
 */
export function computePricingRecommendation(input) {
  const demandScore = Number(input.demandScore || 0);
  const demandLevel = input.demandLevel || 'Moderate';
  const hotelPrice = Number(input.hotelPrice || 0);
  const marketAvgPriceInput = Number(input.marketAvgPrice || 0);
  const marketAvgPrice = marketAvgPriceInput > 0 ? marketAvgPriceInput : hotelPrice;
  const competitorMomentum = input.competitorMomentum || { score: 50, avgChangePct: 0, direction: 'stable' };
  const holidayScore = Number(input.holidayScore || 50);
  const airfareScore = Number(input.airfareScore || 50);
  const city = input.city || 'Mumbai';

  const gap = marketAvgPrice - hotelPrice;
  const positionPct = marketAvgPrice > 0 ? ((hotelPrice - marketAvgPrice) / marketAvgPrice) * 100 : 0;
  const underpricedPct = Math.max(0, -positionPct);

  let rawSuggested = hotelPrice;
  let action = 'maintain';

  if (demandLevel === 'Low') {
    rawSuggested = hotelPrice * 0.97;
    action = rawSuggested < hotelPrice ? 'reduce' : 'maintain';
  } else if (demandLevel === 'Moderate') {
    if (underpricedPct > 20) {
      rawSuggested = hotelPrice + gap * 0.4;
      action = 'increase';
    } else if (positionPct > 15) {
      rawSuggested = hotelPrice + gap * 0.35;
      action = 'reduce';
    } else {
      rawSuggested = hotelPrice;
      action = 'maintain';
    }
  } else if (demandLevel === 'High') {
    rawSuggested = hotelPrice + gap * 0.6;
    action = 'increase';
  } else if (demandLevel === 'Surge') {
    rawSuggested = hotelPrice + gap * 0.8;
    action = 'increase';
  }

  const base = roundToNearest50(rawSuggested);

  const marketMomentumNegative =
    Number(competitorMomentum.avgChangePct || 0) < 0 || competitorMomentum.direction === 'down';
  const overpriced = positionPct > 15;
  const raisingInSoftDemand = demandScore < 50 && base > hotelPrice;

  let riskPoints = 0;
  if (raisingInSoftDemand) riskPoints += 1;
  if (overpriced) riskPoints += positionPct > 40 ? 2 : 1;
  if (marketMomentumNegative) riskPoints += 1;
  if (demandLevel === 'Surge') riskPoints += 1;

  let riskLevel = 'Low';
  if (riskPoints >= 2) riskLevel = 'Medium';
  if (riskPoints >= 3) riskLevel = 'High';

  const heatRaw = clamp(
    Number(competitorMomentum.score || 50) * 0.5 + holidayScore * 0.3 + airfareScore * 0.2,
    0,
    100,
  );

  const noCompetitorSignal = marketAvgPriceInput <= 0;
  const bands = ensureOrderedBands(
    noCompetitorSignal
      ? {
          safe: normalizeBand(base * 0.98, base * 1.02),
          aggressive: normalizeBand(base * 1.02, base * 1.05),
          premium: normalizeBand(base * 1.05, base * 1.09),
        }
      : {
          safe: normalizeBand(base * 0.97, base * 1.03),
          aggressive: normalizeBand(base * 1.03, base * 1.08),
          premium: normalizeBand(marketAvgPrice * 0.95, marketAvgPrice * 1.05),
        },
  );

  return {
    base,
    bands,
    riskLevel,
    marketHeat: heatFromScore(heatRaw),
    action,
    strategy: strategyText(demandLevel, underpricedPct, city),
    notes: noCompetitorSignal ? ['No competitor data; neutral price bands applied.'] : [],
    positionPct: round(positionPct, 2),
    gap: round(gap, 2),
  };
}
