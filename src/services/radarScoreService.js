import { getHotelById } from '../repositories/hotelRepository.js';
import {
  listMarketHotelSignals,
  listMarketHotelsByNamesAndCity,
} from '../repositories/marketHotelRepository.js';
import { getDashboard } from './dashboardService.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

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

function toSignalSet(signals = [], hotelId) {
  return new Set(
    signals
      .filter((signal) => signal.hotelId === hotelId)
      .map((signal) => signal.signalType),
  );
}

function computePricingAlignment(positionPct) {
  const deviation = Math.abs(Number(positionPct || 0));
  return round(clamp(100 - deviation * 2.2, 35, 95));
}

function computeReviewStrength(signalSet) {
  let score = 62;
  if (signalSet.has('HIGH_REVIEW_ACTIVITY')) score += 18;
  if (signalSet.has('REPUTATION_WEAKNESS')) score -= 22;
  return round(clamp(score, 20, 96));
}

function computeDemandAlignment(demandLevel, confidenceScore) {
  const demandBase =
    demandLevel === 'Surge' ? 88
      : demandLevel === 'High' ? 78
        : demandLevel === 'Moderate' ? 66
          : 52;
  return round(clamp(demandBase * 0.65 + Number(confidenceScore || 0) * 0.35, 30, 98));
}

function computeOtaDependence(signalSet) {
  return signalSet.has('OTA_DEPENDENCE') ? 42 : 78;
}

function computeDirectBooking(signalSet) {
  let score = 68;
  if (signalSet.has('CHATBOT_GAP')) score -= 20;
  if (signalSet.has('OTA_DEPENDENCE')) score -= 8;
  if (signalSet.has('HIGH_REVIEW_ACTIVITY')) score += 6;
  return round(clamp(score, 25, 94));
}

export async function getRadarScoreForUser(
  user,
  deps = {
    getHotelById,
    getDashboard,
    listMarketHotelsByNamesAndCity,
    listMarketHotelSignals,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for RADAR score.');
    error.status = 400;
    throw error;
  }

  const hotelId = hotelIds[0];
  const cached = getCachedPayload(hotelId);
  if (cached) {
    return cached;
  }

  const hotel = await deps.getHotelById(hotelId);
  if (!hotel?.city || !hotel?.hotel_name) {
    const error = new Error('Unable to determine hotel context for RADAR score.');
    error.status = 404;
    throw error;
  }

  const [dashboard, matchedHotels, signals] = await Promise.all([
    deps.getDashboard(hotelId, {
      user_id: user?.id || null,
      user_role: user?.role || null,
    }),
    deps.listMarketHotelsByNamesAndCity(hotel.city, [hotel.hotel_name]),
    deps.listMarketHotelSignals([], hotel.city),
  ]);

  const matchedHotel = matchedHotels[0] || null;
  const signalSet = matchedHotel ? toSignalSet(signals, matchedHotel.id) : new Set();

  const components = {
    pricing_alignment: computePricingAlignment(dashboard?.marketPosition?.positionPct),
    review_strength: computeReviewStrength(signalSet),
    demand_alignment: computeDemandAlignment(dashboard?.demandLevel, dashboard?.confidence?.score),
    ota_dependence: computeOtaDependence(signalSet),
    direct_booking: computeDirectBooking(signalSet),
  };

  const radarScore = round(
    components.pricing_alignment * 0.24 +
      components.review_strength * 0.22 +
      components.demand_alignment * 0.24 +
      components.ota_dependence * 0.15 +
      components.direct_booking * 0.15,
  );

  const payload = {
    hotel_id: hotelId,
    city: hotel.city,
    radar_score: radarScore,
    components,
    generated_at: dashboard?.lastUpdated || new Date().toISOString().slice(0, 10),
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
