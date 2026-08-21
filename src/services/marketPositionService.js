import { average, round } from '../utils/math.js';

const MIN_COMP_SET_ROWS_FOR_MARKET_AVG = 3;

export function computeMarketPosition(hotelPrice, competitorRates) {
  const competitorPrices = competitorRates
    .map((row) => Number(row.price_today))
    .filter((value) => Number.isFinite(value) && value > 0);

  const marketAvg = competitorPrices.length >= MIN_COMP_SET_ROWS_FOR_MARKET_AVG
    ? average(competitorPrices)
    : 0;

  if (!hotelPrice || !marketAvg) {
    return {
      hotelPrice: hotelPrice || 0,
      marketAvg: round(marketAvg || 0),
      positionPct: 0,
      competitorSampleSize: competitorPrices.length,
      marketAvgStatus: competitorPrices.length
        ? 'insufficient_approved_comp_set'
        : 'not_captured',
    };
  }

  const positionPct = ((hotelPrice - marketAvg) / marketAvg) * 100;

  return {
    hotelPrice: round(hotelPrice),
    marketAvg: round(marketAvg),
    positionPct: round(positionPct),
    competitorSampleSize: competitorPrices.length,
    marketAvgStatus: 'ready',
  };
}
