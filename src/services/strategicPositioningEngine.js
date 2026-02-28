import { clamp, round } from '../utils/math.js';

const SPI_WEIGHTS = {
  // Position remains the strongest signal because price posture directly impacts pickup and parity.
  position: 0.35,
  // Confidence validates whether signals are trustworthy enough for strategic moves.
  confidence: 0.2,
  // Demand quality controls how much upside exists in current market conditions.
  demand: 0.2,
  // Lower volatility is favorable; unstable markets reduce strategic clarity.
  volatility: 0.15,
  // Compression adds tactical upside when inventory pressure rises.
  compression: 0.1,
};

function normalizePosition(positionPercent) {
  // Best strategic posture is around slight under-market pricing (~-5%) for controlled yield upside.
  const ideal = -5;
  const distance = Math.abs(Number(positionPercent) - ideal);
  return clamp(100 - (distance / 40) * 100, 0, 100);
}

function normalizeConfidence(confidenceScore) {
  return clamp(Number(confidenceScore), 0, 100);
}

function normalizeDemand(demandScore) {
  return clamp(Number(demandScore), 0, 100);
}

function normalizeVolatility(volatilityScore) {
  // Lower volatility should contribute positively to SPI.
  return clamp(100 - Number(volatilityScore), 0, 100);
}

function normalizeCompression(compressionScore) {
  return clamp(Number(compressionScore), 0, 100);
}

function categorize(spiScore) {
  // Strong Advantage: clear market posture with reliable supporting signals.
  if (spiScore >= 70) return 'Strong Advantage';
  // Neutral: mixed posture, monitor and move with controlled steps.
  if (spiScore >= 45) return 'Neutral';
  // Vulnerable: weak posture and/or unstable context; defensive strategy recommended.
  return 'Vulnerable';
}

/**
 * Compute Strategic Positioning Index (SPI), a composite strategic strength score.
 * @param {{
 *   positionPercent:number,
 *   confidenceScore:number,
 *   demandScore:number,
 *   volatilityScore:number,
 *   compressionScore:number
 * }} input
 * @returns {{
 *   spiScore:number,
 *   category:'Strong Advantage'|'Neutral'|'Vulnerable',
 *   components:{
 *     weightedPosition:number,
 *     weightedConfidence:number,
 *     weightedDemand:number,
 *     weightedVolatility:number,
 *     weightedCompression:number,
 *     normalizedPosition:number,
 *     normalizedConfidence:number,
 *     normalizedDemand:number,
 *     normalizedVolatility:number,
 *     normalizedCompression:number
 *   }
 * }}
 */
export function computeStrategicPositioningIndex(input = {}) {
  const normalizedPosition = normalizePosition(input.positionPercent);
  const normalizedConfidence = normalizeConfidence(input.confidenceScore);
  const normalizedDemand = normalizeDemand(input.demandScore);
  const normalizedVolatility = normalizeVolatility(input.volatilityScore);
  const normalizedCompression = normalizeCompression(input.compressionScore);

  const weightedPosition = round(normalizedPosition * SPI_WEIGHTS.position, 2);
  const weightedConfidence = round(normalizedConfidence * SPI_WEIGHTS.confidence, 2);
  const weightedDemand = round(normalizedDemand * SPI_WEIGHTS.demand, 2);
  const weightedVolatility = round(normalizedVolatility * SPI_WEIGHTS.volatility, 2);
  const weightedCompression = round(normalizedCompression * SPI_WEIGHTS.compression, 2);

  const spiScore = round(
    clamp(
      weightedPosition +
        weightedConfidence +
        weightedDemand +
        weightedVolatility +
        weightedCompression,
      0,
      100,
    ),
    2,
  );

  return {
    spiScore,
    category: categorize(spiScore),
    components: {
      weightedPosition,
      weightedConfidence,
      weightedDemand,
      weightedVolatility,
      weightedCompression,
      normalizedPosition: round(normalizedPosition, 2),
      normalizedConfidence: round(normalizedConfidence, 2),
      normalizedDemand: round(normalizedDemand, 2),
      normalizedVolatility: round(normalizedVolatility, 2),
      normalizedCompression: round(normalizedCompression, 2),
    },
  };
}
