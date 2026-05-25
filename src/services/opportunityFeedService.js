import { listTopRankedOpportunitiesForFeed } from '../repositories/marketHotelRepository.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

const SIGNAL_COPY = Object.freeze({
  WEEKEND_COMPRESSION: {
    title: 'Weekend Compression',
    description: 'Compression pressure is rising in this cluster heading into the weekend.',
    recommendedAction: 'Increase weekend rates by 10-15%',
  },
  DEMAND_SURGE_CLUSTER: {
    title: 'Demand Surge Cluster',
    description: 'Nearby hotels are seeing unusually strong demand at the same time.',
    recommendedAction: 'Lift rates gradually and monitor pickup every few hours',
  },
  TOURISM_SPIKE: {
    title: 'Tourism Spike',
    description: 'Leisure demand is building in this market pocket.',
    recommendedAction: 'Hold premium pricing and limit broad discounting',
  },
  CORPORATE_EVENT_CLUSTER: {
    title: 'Corporate Event Cluster',
    description: 'Business-travel and event demand is stacking up nearby.',
    recommendedAction: 'Push weekday corporate packages and tighten low-rate inventory',
  },
  WEDDING_DEMAND_ZONE: {
    title: 'Wedding Demand Zone',
    description: 'This cluster is showing signals consistent with wedding-led demand.',
    recommendedAction: 'Promote room-plus-banquet bundles and event-led premiums',
  },
  EVENT_DEMAND_ZONE: {
    title: 'Event Demand Zone',
    description: 'Event-driven demand is building around this hotel.',
    recommendedAction: 'Increase event-date rates and review minimum-stay controls',
  },
  HIGH_REVIEW_ACTIVITY: {
    title: 'High Review Activity',
    description: 'The hotel is outperforming nearby peers on review volume.',
    recommendedAction: 'Protect rate integrity and capture more direct demand',
  },
  REPUTATION_WEAKNESS: {
    title: 'Reputation Weakness',
    description: 'Review volume is healthy, but rating quality is trailing the local market.',
    recommendedAction: 'Prioritize guest recovery and protect discounts until ratings improve',
  },
  CHATBOT_GAP: {
    title: 'Chatbot Gap',
    description: 'Direct-conversion demand exists here, but chatbot coverage appears missing.',
    recommendedAction: 'Enable chatbot-led conversion for high-intent traffic',
  },
  OTA_DEPENDENCE: {
    title: 'OTA Dependence',
    description: 'The hotel looks visible in-market but may still be overly reliant on OTA demand.',
    recommendedAction: 'Shift demand mix toward direct channels with conversion offers',
  },
  PRICE_PRESSURE: {
    title: 'Price Pressure',
    description: 'The market is signaling upward pricing pressure around this hotel.',
    recommendedAction: 'Test controlled price increases and watch booking velocity',
  },
  AIRPORT_DEMAND: {
    title: 'Airport Demand',
    description: 'Airport-adjacent demand signals are active near this cluster.',
    recommendedAction: 'Lean into short-stay, transit, and arrival-driven packaging',
  },
  FESTIVAL_DEMAND: {
    title: 'Festival Demand',
    description: 'Festival activity is likely supporting demand around this hotel.',
    recommendedAction: 'Increase event-window pricing and tighten last-minute discounts',
  },
});

function buildCacheKey({ city = '', signalType = '', limitPerCity = 20, limit = 200 } = {}) {
  return [city || '*', signalType || '*', limitPerCity, limit].join(':');
}

function getCachedPayload(key) {
  const cached = responseCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }

  return cached.payload;
}

function setCachedPayload(key, payload) {
  responseCache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function normalizeTitle(signalType) {
  return String(signalType || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildDescription(signalType, hotelName, city) {
  const fallback = `${normalizeTitle(signalType)} detected near ${hotelName || city || 'this market cluster'}.`;
  const configured = SIGNAL_COPY[signalType]?.description;
  if (!configured) {
    return fallback;
  }

  if (!hotelName) {
    return configured;
  }

  return `${configured} Focus area: ${hotelName}.`;
}

function getRecommendedAction(signalType) {
  return SIGNAL_COPY[signalType]?.recommendedAction || 'Review this opportunity and validate the local signal mix';
}

function getTitle(signalType) {
  return SIGNAL_COPY[signalType]?.title || normalizeTitle(signalType);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toConfidenceScore(score) {
  const safeScore = Number(score || 0);
  return clamp(Math.round(52 + safeScore * 3), 52, 99);
}

function toImpactScore(score) {
  const safeScore = Number(score || 0);
  return Number(safeScore.toFixed(2));
}

function formatOpportunity(row) {
  return {
    hotel_id: row.hotelId,
    hotel_name: row.hotelName || null,
    city: row.city,
    signal_type: row.signalType,
    title: getTitle(row.signalType),
    description: buildDescription(row.signalType, row.hotelName, row.city),
    confidence_score: toConfidenceScore(row.score),
    impact_score: toImpactScore(row.score),
    raw_score: Number(row.score || 0),
    recommended_action: getRecommendedAction(row.signalType),
    created_at: row.createdAt,
    coordinates:
      row.latitude == null || row.longitude == null
        ? null
        : {
            latitude: row.latitude,
            longitude: row.longitude,
          },
  };
}

export async function getMarketOpportunityFeed(
  { city = null, signalType = null, limitPerCity = 20, limit = 200 } = {},
  deps = { listTopRankedOpportunitiesForFeed },
) {
  const cacheKey = buildCacheKey({ city, signalType, limitPerCity, limit });
  const cached = getCachedPayload(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await deps.listTopRankedOpportunitiesForFeed({
    city,
    signalType,
    limitPerCity,
    limit,
  });

  const payload = {
    opportunities: rows.map((row) => formatOpportunity(row)),
  };

  setCachedPayload(cacheKey, payload);
  return payload;
}
