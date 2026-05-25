import { getHotelById } from '../repositories/hotelRepository.js';
import { getDashboard } from './dashboardService.js';
import { getCompetitorIntelligenceForUser } from './competitorIntelligenceService.js';
import { getMarketOpportunityFeed } from './opportunityFeedService.js';

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

function normalizeMarketDemand(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'surge' || text === 'high') {
    return 'Strong';
  }
  if (text === 'moderate') {
    return 'Moderate';
  }
  if (text === 'low') {
    return 'Weak';
  }
  return 'Moderate';
}

function buildCompetitorAlert(competitorPayload) {
  const competitors = Array.isArray(competitorPayload?.competitors) ? competitorPayload.competitors : [];
  const activeCount = competitors.filter((entry) => entry?.review_activity_signal).length;

  if (activeCount > 0) {
    return `${activeCount} nearby hotels showing strong review activity`;
  }

  if (competitors.length > 0) {
    return `${competitors.length} nearby hotels tracked in the market set`;
  }

  return 'Competitor movement is currently limited';
}

function normalizeOpportunityText(value) {
  return String(value || '')
    .replace(/\s*Focus area:\s*[^.]+\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTopOpportunity(opportunities = [], city = '') {
  const top = Array.isArray(opportunities) && opportunities.length ? opportunities[0] : null;
  if (!top) {
    return `No major market opportunity is active in ${city}.`;
  }

  const description = normalizeOpportunityText(top.description);
  if (description) {
    return description;
  }

  const title = normalizeOpportunityText(top.title);
  if (title) {
    return `${title} is active in ${city}.`;
  }

  return `Top opportunity detected in ${city}.`;
}

function buildVerification({ hotel, dashboard, competitorPayload, opportunitiesPayload }) {
  const checks = [
    {
      key: 'hotel_context',
      label: 'Hotel context',
      passed: Boolean(String(hotel?.city || '').trim()),
    },
    {
      key: 'dashboard_snapshot',
      label: 'Dashboard snapshot',
      passed:
        Boolean(dashboard?.lastUpdated) &&
        Number.isFinite(Number(dashboard?.confidence?.score ?? NaN)) &&
        Number(dashboard?.confidence?.score || 0) >= 0,
    },
    {
      key: 'competitor_signal',
      label: 'Competitor signal',
      passed: Array.isArray(competitorPayload?.competitors) && competitorPayload.competitors.length > 0,
    },
    {
      key: 'opportunity_signal',
      label: 'Opportunity signal',
      passed: Array.isArray(opportunitiesPayload?.opportunities) && opportunitiesPayload.opportunities.length > 0,
    },
  ];

  const passCount = checks.filter((check) => check.passed).length;
  const verified = passCount >= 2;

  return {
    status: verified ? 'verified' : 'review',
    label: verified ? 'Checked twice before display' : 'Needs review before display',
    pass_count: passCount,
    checks,
    checked_at: new Date().toISOString(),
  };
}

export async function getMorningBriefForUser(
  user,
  deps = {
    getHotelById,
    getDashboard,
    getCompetitorIntelligenceForUser,
    getMarketOpportunityFeed,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for morning brief.');
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

  const [dashboard, competitorPayload, opportunitiesPayload] = await Promise.all([
    deps.getDashboard(hotelId, {
      user_id: user?.id || null,
      user_role: user?.role || null,
    }),
    deps.getCompetitorIntelligenceForUser(user),
    deps.getMarketOpportunityFeed({
      city: hotel.city,
      limitPerCity: 5,
      limit: 5,
    }),
  ]);

  const payload = {
    city: hotel.city,
    market_demand: normalizeMarketDemand(dashboard?.demandLevel),
    recommended_price: round(dashboard?.suggestedPricing?.base || 0, 0),
    current_price: round(dashboard?.marketPosition?.hotelPrice || 0, 0),
    confidence: round(dashboard?.confidence?.score || 0, 0),
    competitor_alert: buildCompetitorAlert(competitorPayload),
    top_opportunity: buildTopOpportunity(opportunitiesPayload?.opportunities, hotel.city),
    generated_at: String(dashboard?.lastUpdated || new Date().toISOString()).slice(0, 10),
    verification: buildVerification({
      hotel,
      dashboard,
      competitorPayload,
      opportunitiesPayload,
    }),
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
