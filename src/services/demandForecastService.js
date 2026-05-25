import { getHotelById } from '../repositories/hotelRepository.js';
import { listRecentMarketHotelSignalsForFeed } from '../repositories/marketHotelRepository.js';
import { getDemandCalendar } from './demandCalendarService.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

const SIGNAL_WEIGHTS = Object.freeze({
  festival_demand: 16,
  event_demand_zone: 12,
  corporate_event_cluster: 10,
  tourism_spike: 11,
  airport_demand: 7,
  weekend_compression: 14,
});

function getCachedPayload(hotelId) {
  const cached = responseCache.get(hotelId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(hotelId);
    return null;
  }

  return cached.payload;
}

function setCachedPayload(hotelId, payload) {
  responseCache.set(hotelId, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function toDateKey(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function parseDateKey(value) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function demandLevelFromScore(score) {
  if (score >= 80) return 'peak';
  if (score >= 60) return 'strong';
  if (score >= 40) return 'moderate';
  return 'weak';
}

function buildSignalStrengthMap(signals = []) {
  const map = new Map();

  for (const signal of signals) {
    const signalType = String(signal.signalType || '').trim().toLowerCase();
    if (!SIGNAL_WEIGHTS[signalType]) {
      continue;
    }

    const existing = map.get(signalType) || [];
    existing.push(Number(signal.signalStrength || 0));
    map.set(signalType, existing);
  }

  return map;
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function normalizeStrength(value) {
  return clamp(Number(value || 0), 0, 5) / 5;
}

function computeBaseSignalScore(signalStrengthMap) {
  if (!signalStrengthMap.size) {
    return 28;
  }

  let totalWeight = 0;
  let weightedStrength = 0;

  for (const [signalType, values] of signalStrengthMap.entries()) {
    const avgStrength = average(values);
    const weight = Number(SIGNAL_WEIGHTS[signalType] || 0);
    totalWeight += weight;
    weightedStrength += weight * normalizeStrength(avgStrength);
  }

  if (!totalWeight) {
    return 28;
  }

  return round(26 + (weightedStrength / totalWeight) * 38, 1);
}

function buildEventImpactMap(events = [], city = '') {
  const cityEvents = events.filter((entry) => entry.city === city);
  const map = new Map();

  for (const event of cityEvents) {
    const start = parseDateKey(event.start_date);
    const end = parseDateKey(event.end_date);

    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = toDateKey(cursor);
      const current = map.get(key) || 0;
      map.set(key, current + Number(event.expected_demand_increase || 0) * 0.45);
    }
  }

  return map;
}

function getWeekendBonus(date) {
  const day = date.getUTCDay();
  if (day === 5) return 10;
  if (day === 6) return 14;
  if (day === 0) return 8;
  return 0;
}

export async function getDemandForecastForUser(
  user,
  { horizonDays = 7, signalHours = 72 } = {},
  deps = {
    getHotelById,
    listRecentMarketHotelSignalsForFeed,
    getDemandCalendar,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for demand forecast.');
    error.status = 400;
    throw error;
  }

  const hotelId = hotelIds[0];
  const cached = getCachedPayload(hotelId);
  if (cached) {
    return cached;
  }

  const hotel = await deps.getHotelById(hotelId);
  if (!hotel?.city) {
    const error = new Error('Unable to determine hotel city from authenticated context.');
    error.status = 404;
    throw error;
  }

  const [signals, calendarPayload] = await Promise.all([
    deps.listRecentMarketHotelSignalsForFeed({
      city: hotel.city,
      hours: signalHours,
    }),
    deps.getDemandCalendar({ horizonDays, hours: signalHours }),
  ]);

  const signalStrengthMap = buildSignalStrengthMap(signals);
  const baseSignalScore = computeBaseSignalScore(signalStrengthMap);
  const eventImpactMap = buildEventImpactMap(calendarPayload?.events || [], hotel.city);
  const today = parseDateKey(toDateKey(new Date()));

  const forecast = Array.from({ length: Math.max(1, horizonDays) }, (_, index) => {
    const date = addDays(today, index);
    const dateKey = toDateKey(date);
    const score = clamp(
      round(baseSignalScore + getWeekendBonus(date) + Number(eventImpactMap.get(dateKey) || 0), 0),
      0,
      100,
    );

    return {
      date: dateKey,
      demand_score: score,
      demand_level: demandLevelFromScore(score),
    };
  });

  const payload = {
    city: hotel.city,
    forecast,
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
