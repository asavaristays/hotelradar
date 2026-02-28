import { getCompetitorRateAverages } from '../../repositories/marketRepository.js';
import { clamp, round2, safePercentChange } from '../../utils/math.js';

export async function runCompetitorMomentumEngine(hotelId) {
  const averages = await getCompetitorRateAverages(hotelId);
  const movementPercent = safePercentChange(averages.current_avg, averages.prior_avg);

  const normalized = clamp(((movementPercent + 20) / 40) * 100, 0, 100);

  let direction = 'stable';
  if (movementPercent >= 2) direction = 'up';
  if (movementPercent <= -2) direction = 'down';

  return {
    score: round2(normalized),
    direction,
    movementPercent: round2(movementPercent),
    completeness: averages.current_avg > 0 && averages.prior_avg > 0 ? 100 : 60,
  };
}
