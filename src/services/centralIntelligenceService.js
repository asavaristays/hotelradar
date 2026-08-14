import { env } from '../config/env.js';

const AIRFARE_STALE_DAYS = 21;

const CI_RULES = {
  minCompetitors: Math.max(1, Number(env.centralIntelligenceMinCompetitors || 3)),
  minOtaSources: Math.max(1, Number(env.centralIntelligenceMinOtaSources || 2)),
  holdConfidence: Math.max(0, Number(env.centralIntelligenceHoldActionConfidence || 40)),
  watchConfidence: Math.max(0, Number(env.centralIntelligenceWatchActionConfidence || 60)),
  strongActionConfidence: Math.max(0, Number(env.centralIntelligenceStrongActionConfidence || 75)),
  competitorFreshHours: Math.max(1, Number(env.centralIntelligenceCompetitorFreshHours || 36)),
  hotelRateFreshHours: Math.max(1, Number(env.centralIntelligenceHotelRateFreshHours || 24)),
};

const MODULE_WEIGHTS = {
  hotel: 0.25,
  ota: 0.15,
  competitor: 0.2,
  market: 0.2,
  event: 0.1,
  seasonality: 0.1,
};

const SUPPORTED_ACTIONS = [
  'Need More Data',
  'Hold',
  'Watch',
  'Increase Watch',
  'Reduce Watch',
  'Increase',
  'Reduce',
  'Close Discount',
  'Minimum Stay',
  'Close Out',
];

const NON_PHYSICAL_EVENT_PATTERNS = [
  /\bonline\b/i,
  /\bvirtual\b/i,
  /\bwebinar\b/i,
  /\bzoom\b/i,
  /\bgoogle meet\b/i,
  /\bteams\b/i,
  /\bhybrid\b/i,
  /\blivestream\b/i,
];

function clamp(value, min = 0, max = 100) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return min;
  return Math.max(min, Math.min(max, safe));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function average(values = []) {
  const safe = values.map(Number).filter(Number.isFinite);
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

function diffHours(left, right) {
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (!leftDate || !rightDate) return null;
  return Math.max(0, (rightDate.getTime() - leftDate.getTime()) / 36e5);
}

function diffDays(left, right) {
  const hours = diffHours(left, right);
  return hours === null ? null : hours / 24;
}

function freshnessFromAge(age, staleAfter) {
  if (age === null || !Number.isFinite(Number(age))) return 0;
  if (age <= staleAfter * 0.25) return 1;
  if (age <= staleAfter * 0.5) return 0.85;
  if (age <= staleAfter) return 0.65;
  return 0.2;
}

function isWeekend(isoDow) {
  const day = Number(isoDow || 0);
  return day === 6 || day === 7;
}

function isPhysicalEvent(event = {}) {
  const haystack = [event.event_name, event.category, event.scale, event.confidence]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return !NON_PHYSICAL_EVENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

function eventText(event = {}) {
  return [event.event_name, event.name, event.title, event.category, event.description]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function isWeddingEvent(event = {}) {
  const text = eventText(event);
  return /\bwedding\b|\bshaadi\b|\bbridal\b|\bbanquet\b|destination wedding|wedding_season|marriage/.test(text);
}

function isMiceEvent(event = {}) {
  const text = eventText(event);
  return /\bmice\b|\bmeeting\b|\bmeetings\b|\bincentive\b|\bincentives\b|\bconference\b|\bconvention\b|\bexhibition\b|\bexpo\b|trade show|\bsummit\b|\bforum\b|\bcorporate\b|\bb2b\b/.test(text);
}

function rateChangePct(row = {}) {
  const today = Number(row.market_avg_price || 0);
  const previous = Number(row.market_avg_price_48h_ago || 0);
  if (today <= 0 || previous <= 0) return null;
  return ((today - previous) / previous) * 100;
}

function hotelVsMarketPct(row = {}) {
  const hotel = Number(row.hotel_avg_price || 0);
  const market = Number(row.market_avg_price || 0);
  if (hotel <= 0 || market <= 0) return null;
  return ((market - hotel) / market) * 100;
}

function demandLevel(score) {
  if (score >= 82) return 'Compression';
  if (score >= 70) return 'High';
  if (score >= 58) return 'Rising';
  if (score >= 40) return 'Normal';
  return 'Low';
}

function moduleOutput({ score, confidence, freshness, reliability, completeness, reasons = [], missing = [] }) {
  const safeCompleteness = clamp(completeness, 0, 1);
  const safeFreshness = clamp(freshness, 0, 1);
  const safeReliability = clamp(reliability, 0, 1);

  return {
    score: round(clamp(score), 1),
    confidence: round(clamp(confidence), 1),
    freshness: round(safeFreshness, 2),
    source_reliability: round(safeReliability, 2),
    completeness: round(safeCompleteness, 2),
    effective_weight: 0,
    top_reasons: reasons.filter(Boolean),
    missing_data: missing.filter(Boolean),
  };
}

function buildHotelModule(row = {}) {
  const hotelPrice = Number(row.hotel_avg_price || 0);
  const marketPrice = Number(row.market_avg_price || 0);
  const hasHotelRate = hotelPrice > 0 && Number(row.hotel_rate_rows || 0) > 0;
  const gapPct = hotelVsMarketPct(row);
  const freshness = freshnessFromAge(
    diffHours(row.hotel_rate_last_captured_at, row.computed_at || new Date()),
    CI_RULES.hotelRateFreshHours,
  );

  if (!hasHotelRate) {
    return moduleOutput({
      score: 50,
      confidence: 10,
      freshness: 0,
      reliability: 0,
      completeness: 0,
      missing: ['Current hotel rate is not captured for this stay date.'],
    });
  }

  return moduleOutput({
    score: gapPct === null ? 50 : clamp(50 + gapPct * 0.8, 20, 85),
    confidence: marketPrice > 0 ? 70 : 55,
    freshness,
    reliability: 0.85,
    completeness: marketPrice > 0 ? 0.8 : 0.55,
    reasons: [
      marketPrice > 0
        ? `Hotel rate captured; hotel is ${gapPct >= 0 ? 'below' : 'above'} market by ${Math.abs(round(gapPct, 1))}%.`
        : 'Hotel rate captured; market comparison is not available yet.',
    ],
    missing: marketPrice > 0 ? [] : ['Market average is unavailable for hotel-position analysis.'],
  });
}

function buildOtaModule(row = {}) {
  const otaRows = Number(row.ota_rate_rows || row.otaRows || 0);
  if (otaRows <= 0) {
    return moduleOutput({
      score: 50,
      confidence: 0,
      freshness: 0,
      reliability: 0,
      completeness: 0,
    missing: [`At least ${CI_RULES.minOtaSources} OTA source(s) are required for strong action.`],
    });
  }

  return moduleOutput({
    score: 55,
    confidence: 65,
    freshness: 0.75,
    reliability: 0.8,
    completeness: clamp(otaRows / CI_RULES.minOtaSources, 0.25, 1),
    reasons: [`${otaRows} OTA observation(s) available.`],
  });
}

function buildCompetitorModule(row = {}) {
  const rows = Number(row.competitor_rate_rows || 0);
  const count = Number(row.competitor_count || 0);
  const changePct = rateChangePct(row);
  const gapPct = hotelVsMarketPct(row);
  const ageHours = diffHours(row.competitor_last_scraped_at, row.computed_at || new Date());
  const freshness = freshnessFromAge(ageHours, CI_RULES.competitorFreshHours);

  if (rows <= 0) {
    return moduleOutput({
      score: 50,
      confidence: 0,
      freshness: 0,
      reliability: 0,
      completeness: 0,
      missing: ['Fresh competitor rows are not captured for this stay date.'],
    });
  }

  const movementLift = changePct === null ? 0 : clamp(changePct * 3, -18, 30);
  const positionLift = gapPct === null ? 0 : clamp(gapPct * 0.8, -16, 18);
  const depthLift = Math.min(18, count * 4);

  return moduleOutput({
    score: clamp(45 + depthLift + movementLift + positionLift, 15, 92),
    confidence: clamp(35 + Math.min(24, rows * 2) + Math.min(24, count * 6) + freshness * 17, 0, 100),
    freshness,
    reliability: 0.9,
    completeness: clamp(count / CI_RULES.minCompetitors, rows >= CI_RULES.minCompetitors ? 0.45 : 0.2, 1),
    reasons: [
      changePct === null
        ? `${count} competitor(s) captured; 48h movement is unavailable.`
        : `${count} competitor(s), market ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(round(changePct, 1))}% vs 48h.`,
    ],
    missing: count >= CI_RULES.minCompetitors ? [] : [`At least ${CI_RULES.minCompetitors} normalized competitors are required for strong action.`],
  });
}

function normalizationIssueCount(row = {}) {
  const raw = row.normalization_critical_issues ?? row.normalizationCriticalIssues ?? row.normalization_issues_count ?? row.normalizationIssuesCount ?? 0;
  if (Array.isArray(raw)) return raw.length;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function hasValidNormalization(row = {}) {
  const status = String(row.normalization_status ?? row.normalizationStatus ?? '').trim().toLowerCase();
  if (status && ['invalid', 'failed', 'critical'].includes(status)) return false;
  if (row.normalization_valid === false || row.normalizationValid === false) return false;
  return normalizationIssueCount(row) <= 0;
}

function criticalDataHealthIssues(row = {}) {
  const raw = row.critical_data_health_issues ?? row.criticalDataHealthIssues ?? row.data_health_critical_issues ?? row.dataHealthCriticalIssues ?? [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const count = Number(raw);
  return Number.isFinite(count) && count > 0 ? Array.from({ length: count }, (_, index) => `critical_issue_${index + 1}`) : [];
}

function buildMarketModule(row = {}) {
  const hasAirfare = Boolean(row.airfare_observed_date);
  const changePct = Number(row.airfare_change_pct || 0);
  const airfareAgeDays = diffDays(row.airfare_observed_date, row.computed_at || new Date());
  const freshness = hasAirfare ? freshnessFromAge(airfareAgeDays, AIRFARE_STALE_DAYS) : 0;
  const weekendLift = isWeekend(row.iso_dow) ? 8 : 0;
  const airfareLift = hasAirfare ? clamp(changePct * 2.2, -18, 28) : 0;

  return moduleOutput({
    score: clamp(45 + weekendLift + airfareLift, 20, 82),
    confidence: hasAirfare ? 55 + freshness * 20 : 20,
    freshness,
    reliability: hasAirfare ? 0.7 : 0.2,
    completeness: hasAirfare ? 0.65 : 0.2,
    reasons: [
      hasAirfare
        ? `Latest airfare signal is ${round(changePct, 1)}%.`
        : 'Airfare signal is not captured yet.',
      isWeekend(row.iso_dow) ? 'Weekend stay date carries natural leisure demand.' : '',
    ],
    missing: hasAirfare ? [] : ['Airfare or transport signal is missing.'],
  });
}

function buildEventModule(row = {}) {
  const events = Array.isArray(row.events) ? row.events.filter(isPhysicalEvent) : [];
  const holidays = Array.isArray(row.holidays) ? row.holidays : [];
  const hasCalendarSignal = events.length > 0 || holidays.length > 0;
  const impact = Number(row.event_impact_score || 0);
  const confirmedBonus = events.some((event) => String(event.confidence || '').toLowerCase() === 'confirmed') ? 8 : 0;
  const largeBonus = events.some((event) => String(event.scale || '').toLowerCase() === 'large') ? 8 : 0;
  const holidayBonus = holidays.length ? 18 : 0;
  const weddingEvents = events.filter(isWeddingEvent);
  const miceEvents = events.filter(isMiceEvent);
  const weddingBonus = weddingEvents.length ? 10 : 0;
  const miceBonus = miceEvents.length ? 8 : 0;
  const eventSegments = [];

  if (weddingEvents.length) {
    eventSegments.push({
      type: 'wedding',
      label: 'Wedding demand',
      event_count: weddingEvents.length,
      opportunity: 'Review wedding-led package pricing, premium room inventory, and minimum-stay controls.',
    });
  }
  if (miceEvents.length) {
    eventSegments.push({
      type: 'mice',
      label: 'MICE demand',
      event_count: miceEvents.length,
      opportunity: 'Review corporate/event room blocks, weekday pricing, meeting packages, and negotiated inventory.',
    });
  }

  const output = moduleOutput({
    score: hasCalendarSignal
      ? clamp(42 + impact * 1.7 + confirmedBonus + largeBonus + holidayBonus + weddingBonus + miceBonus, 30, 94)
      : 35,
    confidence: hasCalendarSignal ? 68 : 35,
    freshness: hasCalendarSignal ? 0.85 : 0.45,
    reliability: holidays.length ? 0.9 : events.length ? 0.7 : 0.4,
    completeness: hasCalendarSignal ? 0.75 : 0.35,
    reasons: [
      weddingEvents[0]?.event_name ? `${weddingEvents[0].event_name} indicates wedding-led demand for this stay date.` : '',
      miceEvents[0]?.event_name ? `${miceEvents[0].event_name} indicates MICE/corporate demand for this stay date.` : '',
      events[0]?.event_name ? `${events[0].event_name} overlaps this stay date.` : '',
      holidays[0]?.holiday_name ? `${holidays[0].holiday_name} is marked for this city.` : '',
    ],
    missing: hasCalendarSignal ? [] : ['No physical event or holiday signal found for this stay date.'],
  });

  return {
    ...output,
    segments: eventSegments,
    wedding_event_count: weddingEvents.length,
    mice_event_count: miceEvents.length,
  };
}

function buildSeasonalityModule(row = {}) {
  const weekend = isWeekend(row.iso_dow);
  return moduleOutput({
    score: weekend ? 56 : 42,
    confidence: 58,
    freshness: 1,
    reliability: 0.75,
    completeness: 0.7,
    reasons: [weekend ? 'Weekend baseline supports leisure demand.' : 'Weekday baseline demand is normal.'],
  });
}

function withEffectiveWeights(modules = {}) {
  const next = { ...modules };
  for (const [key, module] of Object.entries(next)) {
    const baseWeight = MODULE_WEIGHTS[key] || 0;
    next[key] = {
      ...module,
      base_weight: baseWeight,
      effective_weight: round(baseWeight * module.source_reliability * module.freshness * module.completeness, 4),
    };
  }
  return next;
}

function collectMissingEvidence(modules = {}) {
  return Object.values(modules).flatMap((module) => module.missing_data || []);
}

function detectContradictions(row = {}, modules = {}) {
  const contradictions = [];
  const changePct = rateChangePct(row);
  const eventScore = Number(modules.event?.score || 0);
  const marketScore = Number(modules.market?.score || 0);
  const competitorRows = Number(row.competitor_rate_rows || 0);

  if (competitorRows > 0 && changePct !== null && changePct < -3 && eventScore >= 70) {
    contradictions.push('Events indicate demand, but competitor prices are softening.');
  }
  if (competitorRows > 0 && changePct !== null && changePct > 4 && marketScore <= 38) {
    contradictions.push('Competitor prices are rising, but destination travel pressure is weak.');
  }
  if (Number(row.hotel_avg_price || 0) > 0 && Number(row.market_avg_price || 0) <= 0) {
    contradictions.push('Hotel rate is captured, but market price proof is unavailable.');
  }

  return contradictions;
}

function computeCentralDemandScore(modules = {}) {
  const entries = Object.entries(modules).filter(([key]) => key !== 'data_health');
  const totalWeight = entries.reduce((sum, [, module]) => sum + Number(module.effective_weight || 0), 0);
  if (totalWeight <= 0) return 0;
  return clamp(entries.reduce((sum, [, module]) => sum + module.score * module.effective_weight, 0) / totalWeight);
}

function computeConfidence({ modules, contradictions, historicalValidation = 35 }) {
  const weightedModules = Object.values(modules).filter((module) => Number(module.base_weight || 0) > 0);
  const completeness = average(weightedModules.map((module) => module.completeness)) * 100;
  const reliability = average(weightedModules.map((module) => module.source_reliability)) * 100;
  const freshness = average(weightedModules.map((module) => module.freshness)) * 100;
  const consistency = contradictions.length ? Math.max(40, 100 - contradictions.length * 22) : 100;

  return clamp(
    completeness * 0.3 + reliability * 0.25 + freshness * 0.2 + consistency * 0.15 + historicalValidation * 0.1,
  );
}

function buildDataHealthModule({ modules, contradictions, row }) {
  const missingEvidence = collectMissingEvidence(modules);
  const competitorRows = Number(row.competitor_rate_rows || 0);
  const competitorAge = diffHours(row.competitor_last_scraped_at, row.computed_at || new Date());
  const critical = [];
  if (Number(row.hotel_avg_price || 0) <= 0) critical.push('missing_hotel_rate');
  if (Number(row.market_avg_price || 0) <= 0) critical.push('missing_market_price');
  if (competitorRows <= 0) critical.push('missing_competitor_rates');
  if (competitorAge !== null && competitorAge > CI_RULES.competitorFreshHours) critical.push('stale_competitor_rates');
  if (Number(row.ota_rate_rows || row.otaRows || 0) < CI_RULES.minOtaSources) critical.push('insufficient_ota_coverage');
  if (!hasValidNormalization(row)) critical.push('invalid_normalization');
  critical.push(...criticalDataHealthIssues(row));

  return {
    completeness: round(average(Object.values(modules).map((module) => module.completeness)), 2),
    freshness: round(average(Object.values(modules).map((module) => module.freshness)), 2),
    reliability: round(average(Object.values(modules).map((module) => module.source_reliability)), 2),
    consistency: contradictions.length ? 'contradictions_detected' : 'consistent',
    decision_readiness: critical.length ? 'locked' : 'ready',
    critical_issues: critical,
    missing_evidence: missingEvidence,
  };
}

function priceDirection(row = {}, demandScore = 0) {
  const changePct = rateChangePct(row);
  const gapPct = hotelVsMarketPct(row);
  const increaseSupported = (changePct !== null && changePct >= 2) || (gapPct !== null && gapPct >= 6) || demandScore >= 76;
  const reductionSupported = (changePct !== null && changePct <= -3) || (gapPct !== null && gapPct <= -12) || demandScore <= 35;

  if (increaseSupported && !reductionSupported) return 'increase';
  if (reductionSupported && !increaseSupported) return 'reduce';
  return 'hold';
}

function buildProductLock({ confidence, row, contradictions }) {
  const missing = [];
  const competitorRows = Number(row.competitor_rate_rows || 0);
  const competitorCount = Number(row.competitor_count || 0);
  const otaRows = Number(row.ota_rate_rows || row.otaRows || 0);
  const competitorAge = diffHours(row.competitor_last_scraped_at, row.computed_at || new Date());

  if (Number(row.hotel_avg_price || 0) <= 0) missing.push('current hotel rate');
  if (Number(row.market_avg_price || 0) <= 0) missing.push('valid market price');
  if (competitorRows <= 0 || competitorCount < CI_RULES.minCompetitors) missing.push(`${CI_RULES.minCompetitors} normalized competitors`);
  if (otaRows < CI_RULES.minOtaSources) missing.push(`${CI_RULES.minOtaSources} OTA sources`);
  if (competitorAge === null || competitorAge > CI_RULES.competitorFreshHours) missing.push('fresh competitor observations');
  if (!hasValidNormalization(row)) missing.push('valid normalization');
  if (criticalDataHealthIssues(row).length) missing.push('no critical data-health issue');
  if (contradictions.length) missing.push('resolved contradiction check');

  let tier = 'strong_actions_permitted';
  let permittedActions = SUPPORTED_ACTIONS;
  let locked = false;
  let reason = 'Evidence is strong enough for revenue action.';

  if (confidence < CI_RULES.holdConfidence) {
    tier = 'need_more_data';
    permittedActions = ['Need More Data'];
    locked = true;
    reason = `Confidence is below ${CI_RULES.holdConfidence}, so the platform must request more evidence.`;
  } else if (confidence < CI_RULES.watchConfidence) {
    tier = 'watch_only';
    permittedActions = ['Hold', 'Watch'];
    locked = true;
    reason = `Confidence is ${CI_RULES.holdConfidence}-${CI_RULES.watchConfidence - 1}, so only Hold or Watch is permitted.`;
  } else if (confidence < CI_RULES.strongActionConfidence) {
    tier = 'watch_actions_only';
    permittedActions = ['Hold', 'Watch', 'Increase Watch', 'Reduce Watch'];
    locked = true;
    reason = `Confidence is ${CI_RULES.watchConfidence}-${CI_RULES.strongActionConfidence - 1}, so only watch-level pricing actions are permitted.`;
  }

  if (confidence >= CI_RULES.strongActionConfidence && missing.length) {
    tier = 'strong_actions_blocked';
    permittedActions = ['Hold', 'Watch', 'Increase Watch', 'Reduce Watch'];
    locked = true;
    reason = `Strong action is blocked until ${missing.join(', ')} are available.`;
  }

  return {
    locked,
    tier,
    permitted_actions: permittedActions,
    missing_requirements: missing,
    reason,
  };
}

function selectAction({ confidence, direction, productLock }) {
  if (confidence < CI_RULES.holdConfidence) return { action: 'Need More Data', adjustmentPct: 0 };
  if (confidence < CI_RULES.watchConfidence) return { action: direction === 'hold' ? 'Hold' : 'Watch', adjustmentPct: 0 };

  if (direction === 'increase') {
    if (!productLock.locked && confidence >= CI_RULES.strongActionConfidence) return { action: 'Increase', adjustmentPct: 8 };
    return { action: 'Increase Watch', adjustmentPct: 0 };
  }
  if (direction === 'reduce') {
    if (!productLock.locked && confidence >= CI_RULES.strongActionConfidence) return { action: 'Reduce', adjustmentPct: -5 };
    return { action: 'Reduce Watch', adjustmentPct: 0 };
  }

  return { action: confidence >= CI_RULES.watchConfidence ? 'Watch' : 'Hold', adjustmentPct: 0 };
}

function trustStatus(action, productLock) {
  if (action === 'Need More Data') return 'insufficient_data';
  if (productLock.locked) return 'review_only';
  return 'actionable';
}

function driver(type, label, impact, evidence, freshness = '') {
  return { type, label, impact: round(impact, 1), evidence, freshness };
}

function buildTopDrivers(row = {}, modules = {}) {
  const drivers = [];
  const competitor = modules.competitor;
  const hotel = modules.hotel;
  const market = modules.market;
  const event = modules.event;
  const seasonality = modules.seasonality;

  if (competitor?.top_reasons?.[0]) {
    drivers.push(driver('competitor_rates', 'Competitor price evidence', competitor.score, competitor.top_reasons[0], `${competitor.freshness}`));
  }
  if (hotel?.top_reasons?.[0]) {
    drivers.push(driver('hotel_position', 'Hotel price position', hotel.score, hotel.top_reasons[0], `${hotel.freshness}`));
  }
  if (event?.top_reasons?.[0]) {
    drivers.push(driver('events', 'Event and holiday demand', event.score, event.top_reasons[0], `${event.freshness}`));
  }
  if (market?.top_reasons?.[0]) {
    drivers.push(driver('market', 'Destination travel pressure', market.score, market.top_reasons[0], `${market.freshness}`));
  }
  if (seasonality?.top_reasons?.[0]) {
    drivers.push(driver('seasonality', 'Seasonality baseline', seasonality.score, seasonality.top_reasons[0], `${seasonality.freshness}`));
  }

  if (!drivers.length) {
    drivers.push(driver('data_health', 'Missing evidence', 0, 'No verified revenue signal is available for this stay date.', 'missing'));
  }

  return drivers.sort((left, right) => Number(right.impact || 0) - Number(left.impact || 0)).slice(0, 5);
}

function buildFreshness(row = {}) {
  const computedAt = row.computed_at || new Date();
  return {
    competitor_rates: {
      last_observed_at: row.competitor_last_scraped_at || null,
      age_hours: diffHours(row.competitor_last_scraped_at, computedAt),
      stale_after_hours: CI_RULES.competitorFreshHours,
    },
    hotel_rates: {
      last_observed_at: row.hotel_rate_last_captured_at || null,
      age_hours: diffHours(row.hotel_rate_last_captured_at, computedAt),
    },
    ota_rates: {
      rows: Number(row.ota_rate_rows || row.otaRows || 0),
      status: Number(row.ota_rate_rows || row.otaRows || 0) > 0 ? 'captured' : 'not_captured',
    },
    airfare: {
      observed_date: row.airfare_observed_date ? normalizeDateKey(row.airfare_observed_date) : null,
      stale_after_days: AIRFARE_STALE_DAYS,
    },
  };
}

function buildSourceProof(row = {}) {
  return {
    hotel_rate_rows: Number(row.hotel_rate_rows || 0),
    competitor_rate_rows: Number(row.competitor_rate_rows || 0),
    competitor_count: Number(row.competitor_count || 0),
    ota_rate_rows: Number(row.ota_rate_rows || row.otaRows || 0),
    event_count: Array.isArray(row.events) ? row.events.filter(isPhysicalEvent).length : 0,
    holiday_count: Array.isArray(row.holidays) ? row.holidays.length : 0,
    wedding_event_count: Array.isArray(row.events) ? row.events.filter((event) => isPhysicalEvent(event) && isWeddingEvent(event)).length : 0,
    mice_event_count: Array.isArray(row.events) ? row.events.filter((event) => isPhysicalEvent(event) && isMiceEvent(event)).length : 0,
    airfare_observed_date: row.airfare_observed_date ? normalizeDateKey(row.airfare_observed_date) : null,
  };
}

export function scoreCentralStayDateDecision(row = {}) {
  const computedAt = toDate(row.computed_at) || new Date();
  const rawModules = {
    hotel: buildHotelModule(row),
    ota: buildOtaModule(row),
    competitor: buildCompetitorModule(row),
    market: buildMarketModule(row),
    event: buildEventModule(row),
    seasonality: buildSeasonalityModule(row),
  };
  const modules = withEffectiveWeights(rawModules);
  const contradictions = detectContradictions(row, modules);
  const dataHealth = buildDataHealthModule({ modules, contradictions, row });
  const demandScore = computeCentralDemandScore(modules);
  let confidence = computeConfidence({ modules, contradictions });

  if (Number(row.competitor_rate_rows || 0) <= 0) confidence = Math.min(confidence, 35);
  if (diffHours(row.competitor_last_scraped_at, computedAt) > CI_RULES.competitorFreshHours) confidence = Math.min(confidence, 48);

  const roundedConfidence = round(confidence, 1);
  const direction = priceDirection(row, demandScore);
  const productLock = buildProductLock({ confidence: roundedConfidence, row, contradictions });
  const selected = selectAction({ confidence: roundedConfidence, direction, productLock });

  return {
    stay_date: normalizeDateKey(row.stay_date),
    demand_score: round(demandScore, 1),
    confidence_score: roundedConfidence,
    demand_level: demandLevel(demandScore),
    pricing_action: selected.action,
    price_adjustment_pct: selected.adjustmentPct,
    trust_status: trustStatus(selected.action, productLock),
    market_avg_price: Number(row.market_avg_price || 0) > 0 ? round(row.market_avg_price, 0) : null,
    hotel_avg_price: Number(row.hotel_avg_price || 0) > 0 ? round(row.hotel_avg_price, 0) : null,
    competitor_count: Number(row.competitor_count || 0),
    competitor_rate_rows: Number(row.competitor_rate_rows || 0),
    rate_change_pct: rateChangePct(row) === null ? null : round(rateChangePct(row), 1),
    hotel_vs_market_pct: hotelVsMarketPct(row) === null ? null : round(hotelVsMarketPct(row), 1),
    central_intelligence: {
      schema_version: 'central-intelligence-v1',
      action: selected.action,
      reason: productLock.reason,
      direction,
    },
    module_scores: {
      ...modules,
      data_health: dataHealth,
    },
    product_lock: productLock,
    missing_evidence: Array.from(new Set(dataHealth.missing_evidence)),
    contradictory_signals: contradictions,
    source_proof: buildSourceProof(row),
    top_drivers: buildTopDrivers(row, modules),
    freshness: buildFreshness(row),
    computed_at: computedAt.toISOString(),
  };
}

export function scoreCentralStayDateSeries(rows = []) {
  return rows.map(scoreCentralStayDateDecision);
}

export const CENTRAL_INTELLIGENCE_CONTRACT = {
  schema_version: 'central-intelligence-v1',
  module_weights: MODULE_WEIGHTS,
  supported_actions: SUPPORTED_ACTIONS,
  product_lock: {
    below_40: 'Need More Data',
    from_40_to_59: 'Hold / Watch only',
    from_60_to_74: 'Increase Watch / Reduce Watch only',
    from_75: 'Strong actions permitted only when required evidence is present',
  },
  rules: CI_RULES,
};
