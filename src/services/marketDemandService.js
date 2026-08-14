import { assertCityInScope, focusCities } from '../config/productScope.js';
import { listMarketDemandEvidence } from '../repositories/marketDemandRepository.js';
import {
  CENTRAL_INTELLIGENCE_CONTRACT,
  scoreCentralStayDateSeries,
} from './centralIntelligenceService.js';

export function scoreMarketDemandEvidence(rows = []) {
  return scoreCentralStayDateSeries(rows);
}

export async function getMarketDemand(city, options = {}, deps = { listMarketDemandEvidence }) {
  const safeCity = String(city || focusCities[0] || 'Goa').trim();
  assertCityInScope(safeCity);

  const horizonDays = Number.isFinite(Number(options.horizonDays))
    ? Math.max(1, Math.min(60, Math.round(Number(options.horizonDays))))
    : 30;
  const evidenceRows = await deps.listMarketDemandEvidence(safeCity, { horizonDays });
  const days = scoreMarketDemandEvidence(evidenceRows);
  const actionableDays = days.filter((day) => day.trust_status === 'actionable').length;
  const watchDays = days.filter((day) => ['Increase Watch', 'Reduce Watch', 'Watch'].includes(day.pricing_action)).length;

  return {
    city: safeCity,
    horizon_days: horizonDays,
    markets: focusCities,
    generated_at: new Date().toISOString(),
    intelligence_schema_version: CENTRAL_INTELLIGENCE_CONTRACT.schema_version,
    central_intelligence: {
      schema_version: CENTRAL_INTELLIGENCE_CONTRACT.schema_version,
      module_weights: CENTRAL_INTELLIGENCE_CONTRACT.module_weights,
      supported_actions: CENTRAL_INTELLIGENCE_CONTRACT.supported_actions,
      product_lock: CENTRAL_INTELLIGENCE_CONTRACT.product_lock,
    },
    model_basis: [
      'Central Intelligence v1 combines hotel, OTA, competitor, market, event, and seasonality modules.',
      'Each module returns score, confidence, freshness, reliability, completeness, reasons, and missing data.',
      'Effective signal weight = base weight x source reliability x freshness x completeness.',
      'Strong pricing actions are blocked unless hotel rate, competitor rows, OTA coverage, freshness, normalization, and data health are ready.',
    ],
    removed_from_price_action: [
      'Lead/prospecting signals',
      'Website chatbot gap',
      'Reputation-only opportunity scores',
      'Direct booking and missed revenue estimates',
      'Any legacy score that is not mapped to Central Intelligence',
    ],
    data_policy:
      'Events, holidays, airfare, and seasonality can explain demand, but revenue actions are governed by Central Intelligence confidence and product-lock evidence.',
    actionable_days: actionableDays,
    watch_days: watchDays,
    days,
  };
}
