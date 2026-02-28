import { getHotelById } from '../repositories/hotelRepository.js';
import { getHotelRateAverages, getCompetitorRateAverages } from '../repositories/marketRepository.js';
import { createDemandScore } from '../repositories/demandRepository.js';
import { runCompetitorMomentumEngine } from './engines/competitorMomentumEngine.js';
import { runHolidayEngine } from './engines/holidayEngine.js';
import { runAirfareTrendEngine } from './engines/airfareTrendEngine.js';
import { runSeasonalBaselineEngine } from './engines/seasonalBaselineEngine.js';
import { aggregateDemand } from './demandAggregatorService.js';
import { evaluateAndCreateAlerts } from './alertEngine.js';
import { buildExplanation } from './explanationEngine.js';
import { safePercentChange } from '../utils/math.js';
import { detectSurgeWindow } from './surgeWindowService.js';

export async function recalculateHotelDemand(hotelId) {
  const hotel = await getHotelById(hotelId);
  if (!hotel) {
    const err = new Error('Hotel not found');
    err.status = 404;
    throw err;
  }

  const [competitor, holiday, airfare, season, marketAvg, hotelAvg, surgeInThreeDays] = await Promise.all([
    runCompetitorMomentumEngine(hotel.id),
    runHolidayEngine(hotel.city),
    runAirfareTrendEngine(hotel.city),
    runSeasonalBaselineEngine(hotel.city),
    getCompetitorRateAverages(hotel.id),
    getHotelRateAverages(hotel.id),
    detectSurgeWindow(hotel.city),
  ]);

  const aggregate = await aggregateDemand(hotel.city, {
    competitor,
    holiday,
    airfare,
    season,
  });

  const explanation = buildExplanation({
    competitor,
    holiday,
    airfare,
    season,
    level: aggregate.level,
    recommendation: aggregate.recommendation,
  });

  const demand = await createDemandScore({
    hotelId: hotel.id,
    score: aggregate.score,
    level: aggregate.level,
    recommendation: aggregate.recommendation,
    confidence: aggregate.confidence,
    explanation,
    competitorScore: competitor.score,
    holidayScore: holiday.score,
    airfareScore: airfare.score,
    seasonScore: season.score,
  });

  const hotelVsMarketDeviationPercent = safePercentChange(
    Number(hotelAvg.current_avg || 0),
    Number(marketAvg.current_avg || 0),
  );

  const alerts = await evaluateAndCreateAlerts({
    hotel,
    finalScore: aggregate.score,
    competitorMovementPercent: competitor.movementPercent,
    hotelVsMarketDeviationPercent,
    surgeInThreeDays,
  });

  return {
    hotel,
    demand,
    signals: { competitor, holiday, airfare, season },
    alerts,
  };
}
