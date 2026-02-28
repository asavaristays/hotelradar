import { getDailyAlertCount, insertAlerts } from '../repositories/alertRepository.js';

const sensitivityPolicy = {
  conservative: { thresholdMultiplier: 1.2, maxPerDay: 1 },
  balanced: { thresholdMultiplier: 1.0, maxPerDay: 2 },
  aggressive: { thresholdMultiplier: 0.8, maxPerDay: 3 },
};

function severityFromDemandScore(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export async function evaluateAlerts(input) {
  const {
    hotel,
    currentDemandScore,
    previousDemandScore,
    competitorAvgChange,
    marketPositionPct,
    surgeWindow,
    otaMaxGapPct = 0,
    otaGapThreshold = 5,
  } = input;

  const policy = sensitivityPolicy[hotel.alert_sensitivity] || sensitivityPolicy.balanced;

  const scoreShiftThreshold = 12 * policy.thresholdMultiplier;
  const competitorThreshold = 8 * policy.thresholdMultiplier;
  const marketDeviationThreshold = 15 * policy.thresholdMultiplier;
  const otaParityThreshold = Number(otaGapThreshold || 5) * policy.thresholdMultiplier;

  const scoreShift = previousDemandScore == null ? 0 : Math.abs(currentDemandScore - previousDemandScore);
  const candidates = [];

  if (scoreShift > scoreShiftThreshold) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'score_shift',
      severity: severityFromDemandScore(currentDemandScore),
      message: `Demand score moved ${scoreShift.toFixed(2)} points since last run.`,
      metadata: { scoreShift },
    });
  }

  if (Math.abs(competitorAvgChange) > competitorThreshold) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'competitor_movement',
      severity: 'high',
      message: `Competitor pricing moved ${competitorAvgChange.toFixed(2)}% in 48h.`,
      metadata: { competitorAvgChange },
    });
  }

  if (Math.abs(marketPositionPct) > marketDeviationThreshold) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'market_position_deviation',
      severity: 'high',
      message: `Hotel is ${marketPositionPct.toFixed(2)}% vs market average.`,
      metadata: { marketPositionPct },
    });
  }

  if (Math.abs(otaMaxGapPct) > otaParityThreshold) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'ota_parity_gap',
      severity: 'medium',
      message: `OTA parity gap reached ${otaMaxGapPct.toFixed(2)}% across monitored channels.`,
      metadata: { otaMaxGapPct, otaParityThreshold },
    });
  }

  if (surgeWindow) {
    candidates.push({
      hotelId: hotel.id,
      alertType: 'surge_window',
      severity: 'critical',
      message: 'Demand surge window detected within 3 days.',
      metadata: { surgeWindow: true },
    });
  }

  const todayCount = await getDailyAlertCount(hotel.id);
  const allowedCount = Math.max(0, policy.maxPerDay - todayCount);
  const alertsToCreate = candidates.slice(0, allowedCount);

  const created = await insertAlerts(alertsToCreate);

  return {
    created,
    skipped: Math.max(0, candidates.length - alertsToCreate.length),
  };
}
