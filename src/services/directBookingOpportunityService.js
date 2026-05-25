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

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toSignalSet(signals = [], hotelId) {
  return new Set(
    signals
      .filter((signal) => signal.hotelId === hotelId)
      .map((signal) => String(signal.signalType || '').trim()),
  );
}

function computeOtaDependencePercent(signalSet) {
  let percent = 48;
  if (signalSet.has('OTA_DEPENDENCE')) percent += 26;
  if (signalSet.has('CHATBOT_GAP')) percent += 12;
  if (signalSet.has('HIGH_REVIEW_ACTIVITY')) percent += 8;
  return round(clamp(percent, 25, 92));
}

function computeConfidence(signalSet) {
  let score = 0.56;
  if (signalSet.has('OTA_DEPENDENCE')) score += 0.16;
  if (signalSet.has('CHATBOT_GAP')) score += 0.08;
  if (signalSet.has('HIGH_REVIEW_ACTIVITY')) score += 0.07;
  return round(clamp(score, 0.45, 0.95), 2);
}

function computeSuggestedAction(signalSet) {
  if (signalSet.has('CHATBOT_GAP') && signalSet.has('OTA_DEPENDENCE')) {
    return 'Improve direct booking funnel and deploy chatbot-led conversion';
  }
  if (signalSet.has('OTA_DEPENDENCE')) {
    return 'Shift more high-intent demand from OTA to direct channels';
  }
  if (signalSet.has('CHATBOT_GAP')) {
    return 'Close chatbot gap to capture more direct demand';
  }
  return 'Strengthen direct booking journey and monitor channel mix';
}

export async function getDirectBookingOpportunityForUser(
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
    const error = new Error('Hotel context is required for direct booking opportunity.');
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
    const error = new Error('Unable to determine hotel context for direct booking opportunity.');
    error.status = 404;
    throw error;
  }

  const [dashboard, matchedHotels, signals] = await Promise.all([
    deps.getDashboard(hotelId, {
      user_id: user?.id || null,
      user_role: user?.role || null,
    }),
    deps.listMarketHotelsByNamesAndCity(hotel.city, [hotel.hotel_name]),
    deps.listMarketHotelSignals(['OTA_DEPENDENCE', 'CHATBOT_GAP', 'HIGH_REVIEW_ACTIVITY'], hotel.city),
  ]);

  const matchedHotel = matchedHotels[0] || null;
  const signalSet = matchedHotel ? toSignalSet(signals, matchedHotel.id) : new Set();

  const currentPrice = Number(dashboard?.marketPosition?.hotelPrice || dashboard?.suggestedPricing?.base || 0);
  const roomCount = Math.max(1, Number(hotel.room_count || 20));
  const occupancyEstimate =
    String(dashboard?.demandLevel || '').toLowerCase() === 'surge' ? 0.86
      : String(dashboard?.demandLevel || '').toLowerCase() === 'high' ? 0.78
        : String(dashboard?.demandLevel || '').toLowerCase() === 'moderate' ? 0.68
          : 0.58;

  const estimatedMonthlyRevenue = round(currentPrice * roomCount * occupancyEstimate * 30, 0);
  const otaDependencePercent = computeOtaDependencePercent(signalSet);
  const directLeakageRatio = otaDependencePercent / 100 * 0.31;
  const estimatedLostDirectRevenue = round(estimatedMonthlyRevenue * directLeakageRatio, 0);

  const payload = {
    hotel_id: hotelId,
    city: hotel.city,
    ota_dependence_percent: otaDependencePercent,
    estimated_monthly_revenue: estimatedMonthlyRevenue,
    estimated_lost_direct_revenue: estimatedLostDirectRevenue,
    suggested_action: computeSuggestedAction(signalSet),
    confidence: computeConfidence(signalSet),
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
