import { listUpcomingEventsByCity } from '../repositories/eventRepository.js';
import { listRecentMarketHotelSignalsForFeed } from '../repositories/marketHotelRepository.js';
import { focusCities } from '../config/productScope.js';

const CACHE_TTL_MS = 30_000;
let cachedPayload = null;
let cachedAt = 0;

const SIGNAL_EVENT_RULES = [
  {
    signalSource: 'festival_demand',
    eventType: 'festival',
    categories: ['festival', 'carnival', 'major holiday', 'city festival', 'cultural event'],
  },
  {
    signalSource: 'wedding_demand_zone',
    eventType: 'wedding',
    categories: ['wedding', 'marriage', 'banquet', 'bridal'],
  },
  {
    signalSource: 'corporate_event_cluster',
    eventType: 'corporate',
    categories: ['corporate', 'business', 'summit', 'conference', 'expo', 'trade show'],
  },
  {
    signalSource: 'airport_demand',
    eventType: 'airport',
    categories: ['airport', 'aviation', 'travel', 'arrival'],
  },
  {
    signalSource: 'tourism_spike',
    eventType: 'tourism',
    categories: ['tourism', 'leisure', 'holiday', 'travel', 'seasonal'],
  },
];

function getCachedPayload() {
  if (!cachedPayload) {
    return null;
  }

  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    cachedPayload = null;
    cachedAt = 0;
    return null;
  }

  return cachedPayload;
}

function setCachedPayload(payload) {
  cachedPayload = payload;
  cachedAt = Date.now();
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function matchRuleForEvent(event) {
  const category = normalizeText(event?.category);
  const eventName = normalizeText(event?.event_name || event?.eventName);
  const combined = `${category} ${eventName}`.trim();

  const matched = SIGNAL_EVENT_RULES.find((rule) =>
    rule.categories.some((keyword) => combined.includes(normalizeText(keyword))),
  );

  if (matched) {
    return matched;
  }

  return {
    signalSource: 'event_demand_zone',
    eventType: 'event',
  };
}

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function buildSignalStrengthByCity(signals = []) {
  const cityMap = new Map();

  for (const signal of signals) {
    const city = String(signal.city || '').trim();
    const signalType = normalizeText(signal.signalType);
    if (!city || !signalType) {
      continue;
    }

    if (!cityMap.has(city)) {
      cityMap.set(city, new Map());
    }

    const signalMap = cityMap.get(city);
    const existing = signalMap.get(signalType) || [];
    existing.push(Number(signal.signalStrength || 0));
    signalMap.set(signalType, existing);
  }

  return cityMap;
}

function computeDemandIncrease(impactScore, signalStrengths = []) {
  const base = Number(impactScore || 0);
  const avgSignalStrength = signalStrengths.length
    ? signalStrengths.reduce((sum, value) => sum + Number(value || 0), 0) / signalStrengths.length
    : 0;
  return round(Math.min(95, Math.max(10, base + avgSignalStrength * 8)));
}

export async function getDemandCalendar(
  { horizonDays = 30, hours = 72 } = {},
  deps = {
    listUpcomingEventsByCity,
    listRecentMarketHotelSignalsForFeed,
  },
) {
  const cached = getCachedPayload();
  if (cached) {
    return cached;
  }

  const [allSignals, eventGroups] = await Promise.all([
    deps.listRecentMarketHotelSignalsForFeed({ hours }),
    Promise.all(focusCities.map((city) => deps.listUpcomingEventsByCity(city, { horizonDays }))),
  ]);

  const signalStrengthByCity = buildSignalStrengthByCity(allSignals);
  const events = eventGroups
    .flat()
    .map((event) => {
      const city = String(event.city || '').trim();
      const rule = matchRuleForEvent(event);
      const citySignals = signalStrengthByCity.get(city) || new Map();
      const signalStrengths = citySignals.get(rule.signalSource) || [];

      if (!signalStrengths.length) {
        return null;
      }

      return {
        city,
        event_type: rule.eventType,
        event_name: event.event_name,
        start_date: event.start_date,
        end_date: event.end_date,
        expected_demand_increase: computeDemandIncrease(event.impact_score, signalStrengths),
        signal_source: rule.signalSource,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftDate = new Date(left.start_date).getTime();
      const rightDate = new Date(right.start_date).getTime();
      return leftDate - rightDate;
    });

  const payload = { events };
  setCachedPayload(payload);
  return payload;
}
