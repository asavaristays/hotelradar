import { round } from '../../utils/math.js';

function normalizeRisk(riskLevel) {
  if (!riskLevel) return 'Medium';
  if (riskLevel.toLowerCase().includes('high')) return 'High';
  if (riskLevel.toLowerCase().includes('low')) return 'Low';
  return 'Medium';
}

/**
 * Deterministic narrative generation for revenue teams.
 * @param {{
 *  demandScore:number,
 *  demandLevel:string,
 *  signalBreakdown:{competitorMomentum:number,holidayImpact:number,airfareImpact:number,seasonImpact:number},
 *  compression:{compressionLevel:string,scarcityScore:number},
 *  riskLevel:string,
 *  stabilityStatus:string,
 *  seasonProfile:string,
 *  marketPosition:{positionPct:number},
 *  suggestedPricing:{base:number}
 * }} input
 */
export function buildNarrative(input) {
  const demandScore = Number(input.demandScore || 0);
  const demandLevel = input.demandLevel || 'Moderate';
  const compressionLevel = input.compression?.compressionLevel || 'Moderate';
  const stabilityStatus = input.stabilityStatus || 'Stable';
  const seasonProfile = input.seasonProfile || 'Standard';
  const riskLevel = normalizeRisk(input.riskLevel);
  const positionPct = Number(input.marketPosition?.positionPct || 0);
  const suggestedBase = Number(input.suggestedPricing?.base || 0);
  const signals = input.signalBreakdown || {};
  const signalLabels = {
    competitorMomentum: 'Competitor Momentum',
    holidayImpact: 'Holiday Impact',
    eventImpact: 'Event Impact',
    airfareImpact: 'Airfare Impact',
    seasonImpact: 'Season Impact',
  };

  const strongestSignal = Object.entries({
    competitorMomentum: Number(signals.competitorMomentum || 0),
    holidayImpact: Number(signals.holidayImpact || 0),
    eventImpact: Number(signals.eventImpact || 0),
    airfareImpact: Number(signals.airfareImpact || 0),
    seasonImpact: Number(signals.seasonImpact || 0),
  }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] || 'competitorMomentum';
  const strongestSignalLabel = signalLabels[strongestSignal] || 'Demand Signals';

  const summary = `Demand is ${demandLevel} (${round(demandScore, 2)}) with ${compressionLevel.toLowerCase()} compression and ${stabilityStatus.toLowerCase()} market stability.`;
  const marketStory = `Primary driver is ${strongestSignalLabel}; season profile '${seasonProfile}' is active for the current window.`;
  const pricingRationale = `Hotel is ${round(positionPct, 2)}% versus market average. Suggested base price is ₹${Math.round(suggestedBase)} with risk marked ${riskLevel}.`;
  const actionGuidance =
    positionPct > 15
      ? 'Prioritize controlled rate correction and monitor pickup response daily.'
      : positionPct < -15
        ? 'Close underpricing gap in steps while tracking conversion and pace.'
        : 'Hold calibrated pricing and optimize around demand windows.';

  return {
    summary,
    marketStory,
    pricingRationale,
    actionGuidance,
  };
}
