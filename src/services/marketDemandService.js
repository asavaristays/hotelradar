import { assertCityInScope, focusCities } from '../config/productScope.js';
import { listMarketDemandEvidence } from '../repositories/marketDemandRepository.js';

const COMPETITOR_STALE_HOURS = 36;
const AIRFARE_STALE_DAYS = 21;
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

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function normalizeDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

function isWeekend(isoDow) {
  const day = Number(isoDow || 0);
  return day === 6 || day === 7;
}

function isPhysicalEvent(event = {}) {
  const haystack = [
    event.event_name,
    event.category,
    event.scale,
    event.confidence,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return !NON_PHYSICAL_EVENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

function rateChangePct(row = {}) {
  const today = Number(row.market_avg_price || 0);
  const previous = Number(row.market_avg_price_48h_ago || 0);
  if (today <= 0 || previous <= 0) return 0;
  return ((today - previous) / previous) * 100;
}

function priceGapPct(row = {}) {
  const hotel = Number(row.hotel_avg_price || 0);
  const market = Number(row.market_avg_price || 0);
  if (hotel <= 0 || market <= 0) return 0;
  return ((market - hotel) / market) * 100;
}

function eventScore(events = [], impactScore = 0) {
  const physicalEvents = events.filter(isPhysicalEvent);
  if (!physicalEvents.length) return 0;

  const confirmedBonus = physicalEvents.some((event) => String(event.confidence || '').toLowerCase() === 'confirmed')
    ? 8
    : 0;
  const largeBonus = physicalEvents.some((event) => String(event.scale || '').toLowerCase() === 'large')
    ? 8
    : 0;

  return clamp(Number(impactScore || 0) * 2.2 + confirmedBonus + largeBonus, 0, 90);
}

function calendarScore(row = {}) {
  const holidays = Array.isArray(row.holidays) ? row.holidays : [];
  if (holidays.length) return 75;
  if (isWeekend(row.iso_dow)) return 52;
  return 28;
}

function competitorScore(row = {}) {
  const rows = Number(row.competitor_rate_rows || 0);
  if (!rows) return 20;

  const changePct = rateChangePct(row);
  const compSetDepth = Math.min(18, Number(row.competitor_count || 0) * 4);
  const marketMove = clamp(changePct * 3, -18, 30);
  const hotelGap = clamp(priceGapPct(row) * 0.8, -16, 18);

  return clamp(45 + compSetDepth + marketMove + hotelGap, 15, 92);
}

function airfareScore(row = {}) {
  const changePct = Number(row.airfare_change_pct || 0);
  if (!Number.isFinite(changePct) || !row.airfare_observed_date) return 35;
  return clamp(45 + changePct * 2.2, 20, 78);
}

function demandLevel(score) {
  if (score >= 82) return 'Compression';
  if (score >= 70) return 'High';
  if (score >= 58) return 'Rising';
  if (score >= 40) return 'Normal';
  return 'Low';
}

function trustStatus(row = {}, computedAt = new Date()) {
  const competitorRows = Number(row.competitor_rate_rows || 0);
  if (competitorRows <= 0) return 'insufficient_data';

  const competitorAgeHours = diffHours(row.competitor_last_scraped_at, computedAt);
  if (competitorAgeHours === null || competitorAgeHours > COMPETITOR_STALE_HOURS) {
    return 'stale';
  }

  const competitorCount = Number(row.competitor_count || 0);
  if (competitorCount < 3) return 'review_only';

  return 'actionable';
}

function confidenceScore(row = {}, computedAt = new Date(), status = 'review_only') {
  let score = 30;
  const competitorCount = Number(row.competitor_count || 0);
  const competitorRows = Number(row.competitor_rate_rows || 0);
  const hotelRows = Number(row.hotel_rate_rows || 0);
  const competitorAgeHours = diffHours(row.competitor_last_scraped_at, computedAt);
  const airfareAgeDays = diffDays(row.airfare_observed_date, computedAt);

  if (competitorRows > 0) score += Math.min(22, competitorRows * 2);
  if (competitorCount >= 3) score += 16;
  if (competitorCount >= 5) score += 6;
  if (hotelRows > 0) score += 10;

  if (competitorAgeHours !== null && competitorAgeHours <= 12) score += 16;
  else if (competitorAgeHours !== null && competitorAgeHours <= COMPETITOR_STALE_HOURS) score += 8;

  if (airfareAgeDays !== null && airfareAgeDays <= AIRFARE_STALE_DAYS) score += 4;

  if (status === 'stale') score = Math.min(score, 48);
  if (status === 'insufficient_data') score = Math.min(score, 35);
  if (status === 'review_only') score = Math.min(score, 62);

  return clamp(score, 0, 100);
}

function pricingAction(score, confidence, status, row = {}) {
  if (status !== 'actionable') {
    return { action: 'Review Only', adjustmentPct: 0 };
  }

  const changePct = rateChangePct(row);
  const gapPct = priceGapPct(row);
  const supportedIncrease = changePct >= 2 || gapPct >= 6;
  const supportedReduction = changePct <= -3 || gapPct <= -12;

  if (score >= 84 && confidence >= 75 && supportedIncrease) {
    return { action: 'Strong Increase', adjustmentPct: 12 };
  }

  if (score >= 70 && confidence >= 65 && supportedIncrease) {
    return { action: 'Increase', adjustmentPct: 8 };
  }

  if (score <= 38 && confidence >= 60 && supportedReduction) {
    return { action: 'Reduce', adjustmentPct: -5 };
  }

  if (score >= 58) {
    return { action: 'Watch', adjustmentPct: supportedIncrease ? 3 : 0 };
  }

  return { action: 'Hold', adjustmentPct: 0 };
}

function driver(type, label, impact, evidence, freshness = '') {
  return {
    type,
    label,
    impact: round(impact, 1),
    evidence,
    freshness,
  };
}

function buildDrivers(row = {}, components = {}, computedAt = new Date()) {
  const drivers = [];
  const compRows = Number(row.competitor_rate_rows || 0);
  const compCount = Number(row.competitor_count || 0);
  const changePct = rateChangePct(row);
  const gapPct = priceGapPct(row);
  const competitorAgeHours = diffHours(row.competitor_last_scraped_at, computedAt);
  const events = Array.isArray(row.events) ? row.events.filter(isPhysicalEvent) : [];
  const holidays = Array.isArray(row.holidays) ? row.holidays : [];

  if (compRows > 0) {
    drivers.push(
      driver(
        'competitor_rates',
        'Competitor rate movement',
        components.competitor,
        `${compCount} competitors, market ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(round(changePct, 1))}% vs 48h.`,
        competitorAgeHours === null ? 'unknown' : `${round(competitorAgeHours, 1)}h old`,
      ),
    );
  } else {
    drivers.push(
      driver(
        'competitor_rates',
        'Competitor rate movement',
        0,
        'No fresh competitor rows are available for this stay date.',
        'missing',
      ),
    );
  }

  if (Number(row.hotel_avg_price || 0) > 0 && Number(row.market_avg_price || 0) > 0) {
    drivers.push(
      driver(
        'market_position',
        'Hotel price versus market',
        Math.abs(gapPct),
        `Hotel average is ${gapPct >= 0 ? 'below' : 'above'} market by ${Math.abs(round(gapPct, 1))}%.`,
        row.hotel_rate_last_captured_at ? 'captured' : 'estimated',
      ),
    );
  }

  if (events.length) {
    const topEvent = events[0];
    drivers.push(
      driver(
        'events',
        'Event demand',
        components.events,
        `${topEvent.event_name || 'City event'} overlaps this stay date.`,
        topEvent.scraped_at ? 'event captured' : 'manual/event table',
      ),
    );
  }

  if (holidays.length || isWeekend(row.iso_dow)) {
    drivers.push(
      driver(
        'calendar',
        holidays.length ? 'Holiday demand' : 'Weekend demand',
        components.calendar,
        holidays.length
          ? `${holidays[0]?.holiday_name || 'Holiday'} is marked for this city.`
          : 'Weekend stay date has natural leisure demand lift.',
        'calendar',
      ),
    );
  }

  if (row.airfare_observed_date) {
    drivers.push(
      driver(
        'airfare',
        'Airfare trend',
        components.airfare,
        `Latest airfare signal is ${round(Number(row.airfare_change_pct || 0), 1)}%.`,
        normalizeDateKey(row.airfare_observed_date),
      ),
    );
  }

  return drivers
    .sort((left, right) => Number(right.impact || 0) - Number(left.impact || 0))
    .slice(0, 4);
}

function buildFreshness(row = {}, computedAt = new Date()) {
  return {
    competitor_rates: {
      last_observed_at: row.competitor_last_scraped_at || null,
      age_hours: diffHours(row.competitor_last_scraped_at, computedAt),
      stale_after_hours: COMPETITOR_STALE_HOURS,
    },
    hotel_rates: {
      last_observed_at: row.hotel_rate_last_captured_at || null,
    },
    airfare: {
      observed_date: row.airfare_observed_date ? normalizeDateKey(row.airfare_observed_date) : null,
      stale_after_days: AIRFARE_STALE_DAYS,
    },
  };
}

function scoreRow(row = {}) {
  const computedAt = toDate(row.computed_at) || new Date();
  const events = Array.isArray(row.events) ? row.events.filter(isPhysicalEvent) : [];
  const components = {
    competitor: competitorScore(row),
    events: eventScore(events, row.event_impact_score),
    calendar: calendarScore(row),
    airfare: airfareScore(row),
  };
  const score = clamp(
    components.competitor * 0.5 +
      components.events * 0.22 +
      components.calendar * 0.18 +
      components.airfare * 0.1,
    0,
    100,
  );
  const status = trustStatus(row, computedAt);
  const confidence = confidenceScore(row, computedAt, status);
  const action = pricingAction(score, confidence, status, row);

  return {
    stay_date: normalizeDateKey(row.stay_date),
    demand_score: round(score, 1),
    confidence_score: round(confidence, 1),
    demand_level: demandLevel(score),
    pricing_action: action.action,
    price_adjustment_pct: action.adjustmentPct,
    trust_status: status,
    market_avg_price: row.market_avg_price ? round(row.market_avg_price, 0) : null,
    hotel_avg_price: row.hotel_avg_price ? round(row.hotel_avg_price, 0) : null,
    competitor_count: Number(row.competitor_count || 0),
    competitor_rate_rows: Number(row.competitor_rate_rows || 0),
    rate_change_pct: round(rateChangePct(row), 1),
    hotel_vs_market_pct: round(priceGapPct(row), 1),
    top_drivers: buildDrivers(row, components, computedAt),
    freshness: buildFreshness(row, computedAt),
    computed_at: computedAt.toISOString(),
  };
}

export function scoreMarketDemandEvidence(rows = []) {
  return rows.map(scoreRow);
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

  return {
    city: safeCity,
    horizon_days: horizonDays,
    markets: focusCities,
    generated_at: new Date().toISOString(),
    model_basis: [
      'Competitor rates newer than 36h',
      'Hotel price versus city comp-set average',
      'Physical city events and holidays only',
      'Recent airfare trend as supporting signal',
    ],
    removed_from_price_action: [
      'Lead/prospecting signals',
      'Website chatbot gap',
      'Reputation-only opportunity scores',
      'Direct booking and missed revenue estimates',
    ],
    data_policy:
      'Events, holidays, and airfare can explain demand, but Increase/Reduce actions require fresh competitor price evidence.',
    actionable_days: actionableDays,
    days,
  };
}
