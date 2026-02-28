import { average, clamp, round, stdDev } from '../../utils/math.js';

function classifyCompression(score, thresholds) {
  if (score <= thresholds.lowMax) return 'Low';
  if (score <= thresholds.moderateMax) return 'Moderate';
  return 'High';
}

/**
 * Compute deterministic compression intelligence.
 * @param {{
 *  competitorRates:Array<{price_today:number}>,
 *  marketPosition:{hotelPrice:number,marketAvg:number,positionPct:number},
 *  calibration:{compression:{thresholds:{lowMax:number,moderateMax:number,priceVacuumPct:number,opportunityMinFactor:number,opportunityMaxFactor:number}}}
 * }} input
 */
export function computeCompression(input) {
  const rates = (input.competitorRates || [])
    .map((row) => Number(row.price_today || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  const thresholds = input.calibration?.compression?.thresholds || {
    lowMax: 45,
    moderateMax: 70,
    priceVacuumPct: 12,
    opportunityMinFactor: 0.95,
    opportunityMaxFactor: 1.05,
  };

  if (!rates.length) {
    return {
      scarcityScore: 50,
      priceDispersion: 0,
      roomsBelowMarketAvgPct: 0,
      compressionLevel: 'Moderate',
      priceVacuumDetected: false,
      opportunityBand: { min: 0, max: 0 },
      reason: 'Competitor inventory data limited; neutral compression signal applied.',
    };
  }

  const marketAvg = Number(input.marketPosition?.marketAvg || average(rates));
  const hotelPrice = Number(input.marketPosition?.hotelPrice || marketAvg);

  const belowMarketCount = rates.filter((price) => price < marketAvg).length;
  const roomsBelowMarketAvgPct = (belowMarketCount / rates.length) * 100;

  const dispersionPct = (stdDev(rates) / (marketAvg || 1)) * 100;
  const scarcityScore = clamp(
    100 - roomsBelowMarketAvgPct * 0.65 + dispersionPct * 0.4,
    0,
    100,
  );

  const priceVacuumDetected = Math.abs(((hotelPrice - marketAvg) / (marketAvg || 1)) * 100) >= thresholds.priceVacuumPct;
  const compressionLevel = classifyCompression(scarcityScore, thresholds);

  const levelMultiplier = compressionLevel === 'High' ? 1.02 : compressionLevel === 'Moderate' ? 1.0 : 0.98;
  const opportunityBand = {
    min: round(marketAvg * thresholds.opportunityMinFactor * levelMultiplier, 0),
    max: round(marketAvg * thresholds.opportunityMaxFactor * levelMultiplier, 0),
  };

  return {
    scarcityScore: round(scarcityScore, 2),
    priceDispersion: round(dispersionPct, 2),
    roomsBelowMarketAvgPct: round(roomsBelowMarketAvgPct, 2),
    compressionLevel,
    priceVacuumDetected,
    opportunityBand,
    reason: `${compressionLevel} compression with ${round(roomsBelowMarketAvgPct)}% inventory below market average.`,
  };
}

