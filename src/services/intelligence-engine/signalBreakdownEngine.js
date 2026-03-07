import { round } from '../../utils/math.js';

/**
 * Compute deterministic signal contribution breakdown in score points around neutral baseline.
 * Sum of all contributions ~= demandScore - 50.
 * @param {{
 *  signals:{competitor:{score:number},holiday:{score:number,eventShare?:number},airfare:{score:number},season:{score:number}},
 *  weights:{competitor_weight:number,holiday_weight:number,airfare_weight:number,season_weight:number}
 * }} input
 * @returns {{
 *  competitorMomentum:number,
 *  holidayImpact:number,
 *  eventImpact:number,
 *  weddingImpact:number,
 *  corporateEventImpact:number,
 *  otherEventImpact:number,
 *  airfareImpact:number,
 *  seasonImpact:number
 * }}
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
  const categoryShare = signals.holiday?.eventCategoryShare || {};
  const weddingShare = Math.max(
    0,
    Math.min(1, Number(signals.holiday?.weddingShare ?? categoryShare?.wedding_season ?? 0)),
  );
  const corporateShare = Math.max(
    0,
    Math.min(
      1,
      Number(
        signals.holiday?.corporateShare ??
          Number(categoryShare?.conference || 0) + Number(categoryShare?.exhibition || 0),
      ),
    ),
  );

  const normalizedScale = Math.max(1, weddingShare + corporateShare);
  const normalizedWeddingShare = weddingShare / normalizedScale;
  const normalizedCorporateShare = corporateShare / normalizedScale;
  const weddingImpact = eventImpact * normalizedWeddingShare;
  const corporateEventImpact = eventImpact * normalizedCorporateShare;
  const otherEventImpact = eventImpact - weddingImpact - corporateEventImpact;

  return {
    competitorMomentum: round((Number(signals.competitor?.score || 50) - 50) * weights.competitor_weight, 2),
    holidayImpact: round(holidayDelta - eventImpact, 2),
    eventImpact: round(eventImpact, 2),
    weddingImpact: round(weddingImpact, 2),
    corporateEventImpact: round(corporateEventImpact, 2),
    otherEventImpact: round(otherEventImpact, 2),
    airfareImpact: round((Number(signals.airfare?.score || 50) - 50) * weights.airfare_weight, 2),
    seasonImpact: round((Number(signals.season?.score || 50) - 50) * weights.season_weight, 2),
  };
}
