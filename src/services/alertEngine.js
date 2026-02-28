import { getLatestDemandScore } from '../repositories/demandRepository.js';
import { createAlerts, getTodayAlertCount } from '../repositories/alertRepository.js';

const sensitivityConfig = {
  conservative: { multiplier: 1.25, maxPerDay: 1 },
  balanced: { multiplier: 1.0, maxPerDay: 2 },
  aggressive: { multiplier: 0.8, maxPerDay: 3 },
};

function severityFromScore(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export async function evaluateAndCreateAlerts(payload) {
  const {
    hotel,
    finalScore,
    competitorMovementPercent,
    hotelVsMarketDeviationPercent,
    surgeInThreeDays,
  } = payload;

  const currentSettings = sensitivityConfig[hotel.alert_sensitivity] || sensitivityConfig.balanced;
  const previous = await getLatestDemandScore(hotel.id);
  const scoreShift = previous ? Math.abs(finalScore - Number(previous.score)) : 0;

  const thresholdScoreShift = 12 * currentSettings.multiplier;
  const thresholdCompetitor = 8 * currentSettings.multiplier;
  const thresholdPriceDeviation = 15 * currentSettings.multiplier;

  const candidates = [];

  if (scoreShift > thresholdScoreShift) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'score_shift',
      severity: severityFromScore(finalScore),
      message: `Demand score moved ${scoreShift.toFixed(2)} points from last run.`,
    });
  }

  if (Math.abs(competitorMovementPercent) > thresholdCompetitor) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'competitor_movement',
      severity: 'high',
      message: `Competitor movement is ${competitorMovementPercent.toFixed(2)}% over 48h.`,
    });
  }

  if (Math.abs(hotelVsMarketDeviationPercent) > thresholdPriceDeviation) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'price_deviation',
      severity: 'high',
      message: `Hotel pricing deviates ${hotelVsMarketDeviationPercent.toFixed(2)}% from market average.`,
    });
  }

  if (surgeInThreeDays) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'surge_window',
      severity: 'critical',
      message: 'Demand surge window detected within next 3 days.',
    });
  }

  const todayCount = await getTodayAlertCount(hotel.id);
  const remaining = Math.max(0, currentSettings.maxPerDay - todayCount);
  const toCreate = remaining > 0 ? candidates.slice(0, remaining) : [];

  const created = await createAlerts(toCreate);

  return {
    created,
    skippedByDailyLimit: Math.max(0, candidates.length - toCreate.length),
  };
}
