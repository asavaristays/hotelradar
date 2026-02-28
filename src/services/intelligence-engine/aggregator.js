import { clamp, round } from '../../utils/math.js';

export const DEFAULT_CITY_WEIGHTS = {
  Goa: {
    competitor_weight: 0.45,
    holiday_weight: 0.25,
    airfare_weight: 0.2,
    season_weight: 0.1,
  },
  Mumbai: {
    competitor_weight: 0.4,
    holiday_weight: 0.3,
    airfare_weight: 0.15,
    season_weight: 0.15,
  },
  Jodhpur: {
    competitor_weight: 0.42,
    holiday_weight: 0.28,
    airfare_weight: 0.15,
    season_weight: 0.15,
  },
  Pushkar: {
    competitor_weight: 0.41,
    holiday_weight: 0.27,
    airfare_weight: 0.14,
    season_weight: 0.18,
  },
  Jawai: {
    competitor_weight: 0.43,
    holiday_weight: 0.22,
    airfare_weight: 0.1,
    season_weight: 0.25,
  },
  Jaipur: {
    competitor_weight: 0.42,
    holiday_weight: 0.26,
    airfare_weight: 0.14,
    season_weight: 0.18,
  },
  Nainital: {
    competitor_weight: 0.39,
    holiday_weight: 0.24,
    airfare_weight: 0.12,
    season_weight: 0.25,
  },
  Corbett: {
    competitor_weight: 0.4,
    holiday_weight: 0.25,
    airfare_weight: 0.12,
    season_weight: 0.23,
  },
  Mukeshwar: {
    competitor_weight: 0.38,
    holiday_weight: 0.24,
    airfare_weight: 0.13,
    season_weight: 0.25,
  },
  Mukteshwar: {
    competitor_weight: 0.38,
    holiday_weight: 0.24,
    airfare_weight: 0.13,
    season_weight: 0.25,
  },
};

function classify(score) {
  if (score <= 40) return 'Low';
  if (score <= 65) return 'Moderate';
  if (score <= 85) return 'High';
  return 'Surge';
}

function recommendationByLevel(level, confidence) {
  switch (level) {
    case 'Low':
      return { action: 'reduce', percentRange: [8, 15], confidence };
    case 'Moderate':
      return { action: 'maintain', percentRange: [0, 5], confidence };
    case 'High':
      return { action: 'increase', percentRange: [8, 15], confidence };
    case 'Surge':
      return { action: 'increase', percentRange: [15, 25], confidence };
    default:
      return { action: 'maintain', percentRange: [0, 5], confidence };
  }
}

/**
 * Aggregate all engine outputs into final demand score and recommendation.
 * @param {{city:string,weights?:{competitor_weight:number,holiday_weight:number,airfare_weight:number,season_weight:number},signals:{competitor:any,holiday:any,airfare:any,season:any}}} input
 * @returns {{demandScore:number,level:string,recommendation:{action:string,percentRange:[number,number],confidence:number},confidence:number,explanation:string[]}}
 */
export function aggregateDemand(input) {
  const { city, signals } = input;
  const weights = input.weights || DEFAULT_CITY_WEIGHTS[city] || DEFAULT_CITY_WEIGHTS.Mumbai;

  const demandScore = clamp(
    signals.competitor.score * weights.competitor_weight +
      signals.holiday.score * weights.holiday_weight +
      signals.airfare.score * weights.airfare_weight +
      signals.season.score * weights.season_weight,
    0,
    100,
  );

  const confidence = round(
    clamp(
      (signals.competitor.confidence +
        signals.holiday.confidence +
        signals.airfare.confidence +
        signals.season.confidence) /
        4,
      0,
      100,
    ),
  );

  const level = classify(demandScore);
  const recommendation = recommendationByLevel(level, confidence);

  const explanation = [
    signals.competitor.reason,
    signals.holiday.reason,
    signals.airfare.reason,
    signals.season.reason,
  ];

  return {
    demandScore: round(demandScore),
    level,
    recommendation,
    confidence,
    explanation,
  };
}
