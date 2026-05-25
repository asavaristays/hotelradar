import { getHotelById } from '../repositories/hotelRepository.js';
import { listRecentMarketHotelSignalsForFeed } from '../repositories/marketHotelRepository.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

const ALERT_COPY = Object.freeze({
  DEMAND_SURGE_CLUSTER: {
    alertType: 'demand_surge',
    severity: 'high',
    message: (city) => `Demand surge detected in ${city} market cluster.`,
    recommendedAction: 'Increase weekend prices',
  },
  WEEKEND_COMPRESSION: {
    alertType: 'weekend_compression',
    severity: 'high',
    message: (city) => `Weekend compression is rising across ${city}.`,
    recommendedAction: 'Tighten discounting and test higher weekend rates',
  },
  FESTIVAL_DEMAND: {
    alertType: 'festival_demand',
    severity: 'high',
    message: (city) => `Festival-led demand is building in ${city}.`,
    recommendedAction: 'Increase event-window pricing',
  },
  EVENT_DEMAND_ZONE: {
    alertType: 'event_demand',
    severity: 'medium',
    message: (city) => `Event demand zone detected in ${city}.`,
    recommendedAction: 'Review event-date pricing controls',
  },
  CORPORATE_EVENT_CLUSTER: {
    alertType: 'corporate_demand',
    severity: 'medium',
    message: (city) => `Corporate demand activity is clustering in ${city}.`,
    recommendedAction: 'Push weekday corporate packages',
  },
  WEDDING_DEMAND_ZONE: {
    alertType: 'wedding_demand',
    severity: 'medium',
    message: (city) => `Wedding demand is active in ${city}.`,
    recommendedAction: 'Promote room and banquet bundles',
  },
  TOURISM_SPIKE: {
    alertType: 'tourism_spike',
    severity: 'medium',
    message: (city) => `Tourism demand is accelerating in ${city}.`,
    recommendedAction: 'Hold premium pricing and watch pickup',
  },
  AIRPORT_DEMAND: {
    alertType: 'airport_demand',
    severity: 'low',
    message: (city) => `Airport-linked demand is active near ${city}.`,
    recommendedAction: 'Promote short-stay and transit offers',
  },
  PRICE_PRESSURE: {
    alertType: 'price_pressure',
    severity: 'medium',
    message: (city) => `Market price pressure is building in ${city}.`,
    recommendedAction: 'Test controlled rate increases',
  },
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

function pickAlertConfig(signalType) {
  return ALERT_COPY[signalType] || {
    alertType: 'market_signal',
    severity: 'low',
    message: (city) => `Market signal detected in ${city}.`,
    recommendedAction: 'Review this signal and adjust pricing carefully',
  };
}

export async function getIntelligenceAlertsForUser(
  user,
  deps = {
    getHotelById,
    listRecentMarketHotelSignalsForFeed,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for intelligence alerts.');
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

  const signals = await deps.listRecentMarketHotelSignalsForFeed({
    city: hotel.city,
    hours: 24,
  });

  const latestBySignal = new Map();
  for (const signal of signals) {
    const signalType = String(signal.signalType || '').trim();
    if (!signalType || latestBySignal.has(signalType)) {
      continue;
    }
    latestBySignal.set(signalType, signal);
  }

  const alerts = Array.from(latestBySignal.values())
    .map((signal) => {
      const config = pickAlertConfig(signal.signalType);
      return {
        alert_type: config.alertType,
        city: hotel.city,
        signal_source: String(signal.signalType || '').toLowerCase(),
        message: config.message(hotel.city),
        recommended_action: config.recommendedAction,
        created_at: signal.createdAt,
        severity: config.severity,
      };
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 10);

  const payload = { alerts };
  setCachedPayload(hotelId, payload);
  return payload;
}
