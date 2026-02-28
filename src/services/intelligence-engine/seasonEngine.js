import { logger } from '../../config/logger.js';

const monthProfiles = {
  Goa: [68, 72, 66, 54, 40, 28, 24, 30, 42, 58, 80, 88],
  Mumbai: [56, 57, 58, 57, 55, 54, 55, 56, 57, 58, 60, 59],
  Jodhpur: [62, 66, 68, 60, 52, 42, 38, 41, 50, 64, 76, 82],
  Pushkar: [64, 67, 70, 62, 54, 44, 39, 42, 53, 70, 88, 84],
  Jawai: [66, 69, 71, 63, 55, 46, 40, 45, 58, 72, 86, 82],
  Jaipur: [61, 64, 67, 59, 50, 41, 37, 40, 51, 66, 80, 84],
  Nainital: [58, 60, 63, 69, 78, 82, 66, 61, 64, 68, 62, 71],
  Corbett: [62, 64, 66, 70, 76, 81, 68, 63, 65, 69, 72, 74],
  Mukeshwar: [59, 61, 64, 71, 79, 83, 67, 62, 65, 70, 64, 72],
  Mukteshwar: [59, 61, 64, 71, 79, 83, 67, 62, 65, 70, 64, 72],
};

/**
 * Compute city-season baseline score from month profile.
 * @param {{city: string, date?: Date}} input
 * @returns {{score:number,reason:string,confidence:number,neutral:boolean}}
 */
export function computeSeasonScore(input) {
  const date = input?.date ? new Date(input.date) : new Date();
  const city = input?.city;
  const month = date.getUTCMonth();

  logger.info('engine_input', { engine: 'season', city, month });

  const profile =
    Array.isArray(input?.seasonProfileMonthly)
      ? input.seasonProfileMonthly
      : monthProfiles[city];
  if (!profile) {
    const neutral = {
      score: 50,
      reason: `Season profile unavailable for ${city}; using neutral season signal.`,
      confidence: 55,
      neutral: true,
    };
    logger.warn('engine_output', { engine: 'season', ...neutral });
    return neutral;
  }

  const score = profile[month] ?? 50;
  const output = {
    score,
    reason: `${city} seasonal baseline is ${score} for this month.`,
    confidence: 92,
    neutral: false,
  };

  logger.info('engine_output', { engine: 'season', ...output });
  return output;
}
