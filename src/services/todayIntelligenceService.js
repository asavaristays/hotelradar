import { getHotelById } from '../repositories/hotelRepository.js';
import {
  getLatestRankedOpportunityScanByCity,
  getTopRankedOpportunitiesByCity,
} from '../repositories/marketHotelRepository.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

const SIGNAL_RECOMMENDATIONS = Object.freeze({
  WEEKEND_COMPRESSION: 'Increase weekend rates by 10-15%',
  DEMAND_SURGE_CLUSTER: 'Increase rates gradually and watch pickup closely',
  TOURISM_SPIKE: 'Hold premium pricing and tighten discounting',
  CORPORATE_EVENT_CLUSTER: 'Push weekday corporate packages and dynamic pricing',
  WEDDING_DEMAND_ZONE: 'Promote banquet and room bundle pricing',
  EVENT_DEMAND_ZONE: 'Increase event-date rates and minimum stay controls',
  HIGH_REVIEW_ACTIVITY: 'Review pricing and direct demand capture immediately',
  REPUTATION_WEAKNESS: 'Protect rate integrity and prioritize reputation recovery',
  CHATBOT_GAP: 'Enable direct-conversion tools to capture demand',
  OTA_DEPENDENCE: 'Shift demand to direct channels with conversion offers',
});

function buildSummary(signalType, location) {
  const label = String(signalType || '').trim().replaceAll('_', ' ').toLowerCase();
  const normalizedLocation = String(location || '').trim();
  if (!normalizedLocation) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} detected nearby`;
  }

  return `${label.charAt(0).toUpperCase()}${label.slice(1)} detected near ${normalizedLocation}`;
}

function formatOpportunity(opportunity, city) {
  const location = opportunity.hotelName || city;
  return {
    signalType: opportunity.signalType,
    location,
    summary: buildSummary(opportunity.signalType, location),
    recommendedAction:
      SIGNAL_RECOMMENDATIONS[opportunity.signalType] || 'Review this opportunity and adjust strategy',
  };
}

function getCachedResponse(city) {
  const cached = responseCache.get(city);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(city);
    return null;
  }

  return cached.value;
}

function setCachedResponse(city, value) {
  responseCache.set(city, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function getTodayMarketIntelligenceForUser(user) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for market intelligence.');
    error.status = 400;
    throw error;
  }

  const hotel = await getHotelById(hotelIds[0]);
  if (!hotel?.city) {
    const error = new Error('Unable to determine hotel city from authenticated context.');
    error.status = 404;
    throw error;
  }

  const city = String(hotel.city).trim();
  const cached = getCachedResponse(city);
  if (cached) {
    return cached;
  }

  const [lastMarketScan, opportunities] = await Promise.all([
    getLatestRankedOpportunityScanByCity(city),
    getTopRankedOpportunitiesByCity(city, { limit: 5 }),
  ]);

  const payload = {
    lastMarketScan,
    city,
    opportunities: opportunities.map((opportunity) => formatOpportunity(opportunity, city)),
  };

  setCachedResponse(city, payload);

  return payload;
}
