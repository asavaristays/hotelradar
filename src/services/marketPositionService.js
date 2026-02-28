import { average, round } from '../utils/math.js';

export function computeMarketPosition(hotelPrice, competitorRates) {
  const competitorPrices = competitorRates
    .map((row) => Number(row.price_today))
    .filter((value) => Number.isFinite(value) && value > 0);

  const marketAvg = average(competitorPrices);

  if (!hotelPrice || !marketAvg) {
    return {
      hotelPrice: hotelPrice || 0,
      marketAvg: round(marketAvg || 0),
      positionPct: 0,
    };
  }

  const positionPct = ((hotelPrice - marketAvg) / marketAvg) * 100;

  return {
    hotelPrice: round(hotelPrice),
    marketAvg: round(marketAvg),
    positionPct: round(positionPct),
  };
}
