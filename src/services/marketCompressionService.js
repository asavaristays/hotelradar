import { getHotelById } from '../repositories/hotelRepository.js';
import { listRecentMarketHotelSignalsForFeed } from '../repositories/marketHotelRepository.js';
import { getDemandCalendar } from './demandCalendarService.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

const SIGNAL_WEIGHTS = Object.freeze({
  weekend_compression: 0.34,
  demand_surge_cluster: 0.28,
  event_demand_zone: 0.18,
  tourism_spike: 0.2,
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
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function computeCompressionIndex(signalMap, eventBoost = 0) {
  let index = 0.18;

  for (const [signalType, values] of signalMap.entries()) {
    const weight = SIGNAL_WEIGHTS[signalType];
    if (!weight) {
      continue;
    }
    index += weight + average(values) * 0.05;
  }

  index += eventBoost;
  return clamp(index, 0.12, 0.94);
}

function compressionLevelFromIndex(index) {
  if (index >= 0.75) return 'high';
  if (index >= 0.48) return 'moderate';
  return 'low';
}

function expectedSelloutWindow(index) {
  if (index >= 0.82) return '24 hours';
  if (index >= 0.7) return '48 hours';
  if (index >= 0.52) return '72 hours';
  return 'More than 72 hours';
}

function recommendedAction(level) {
  if (level === 'high') return 'Increase prices immediately';
  if (level === 'moderate') return 'Tighten discounting and test higher rates';
  return 'Monitor compression and protect base rate integrity';
}

function buildSignalMap(signals = []) {
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

function computeEventBoost(events = [], city = '') {
  const cityEvents = events.filter((entry) => entry.city === city);
  if (!cityEvents.length) {
    return 0;
  }

  const avgIncrease = average(cityEvents.map((entry) => Number(entry.expected_demand_increase || 0)));
  return clamp(avgIncrease / 200, 0, 0.18);
}

export async function getMarketCompressionForUser(
  user,
  { signalHours = 72, horizonDays = 7 } = {},
  deps = {
    getHotelById,
    listRecentMarketHotelSignalsForFeed,
    getDemandCalendar,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for market compression.');
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

  const signalMap = buildSignalMap(signals);
  const eventBoost = computeEventBoost(calendarPayload?.events || [], hotel.city);
  const confidence = round(computeCompressionIndex(signalMap, eventBoost), 2);
  const level = compressionLevelFromIndex(confidence);

  const payload = {
    city: hotel.city,
    compression_level: level,
    expected_sellout_window: expectedSelloutWindow(confidence),
    recommended_action: recommendedAction(level),
    confidence,
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
