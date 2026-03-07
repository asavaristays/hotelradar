import { round } from '../../utils/math.js';

/**
 * Compute deterministic signal contribution breakdown in score points around neutral baseline.
 * Sum of all contributions ~= demandScore - 50.
 * @param {{
 *  signals:{competitor:{score:number},holiday:{score:number,eventShare?:number},airfare:{score:number},season:{score:number}},
 *  weights:{competitor_weight:number,holiday_weight:number,airfare_weight:number,season_weight:number}
 * }} input
 * @returns {{competitorMomentum:number,holidayImpact:number,eventImpact:number,airfareImpact:number,seasonImpact:number}}
 */
export function computeSignalBreakdown(input) {
  const signals = input.signals || {};
  const weights = input.weights || {
    competitor_weight: 0.4,
    holiday_weight: 0.3,
    airfare_weight: 0.15,
    season_weight: 0.15,
  };
  const holidayDelta = (Number(signals.holiday?.score || 50) - 50) * weights.holiday_weight;
  const eventShare = Number(signals.holiday?.eventShare || 0);
  const safeEventShare = Number.isFinite(eventShare) ? Math.min(1, Math.max(0, eventShare)) : 0;
  const eventImpact = holidayDelta * safeEventShare;

  return {
    competitorMomentum: round((Number(signals.competitor?.score || 50) - 50) * weights.competitor_weight, 2),
    holidayImpact: round(holidayDelta - eventImpact, 2),
    eventImpact: round(eventImpact, 2),
    airfareImpact: round((Number(signals.airfare?.score || 50) - 50) * weights.airfare_weight, 2),
    seasonImpact: round((Number(signals.season?.score || 50) - 50) * weights.season_weight, 2),
  };
}
