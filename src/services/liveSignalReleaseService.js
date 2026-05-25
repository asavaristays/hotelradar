import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { assertCityInScope } from '../config/productScope.js';
import { getLeadRadarExternalSignals } from './googleSignalIntelService.js';
import { getMarketOpportunityFeed } from './opportunityFeedService.js';
import { listRecentMarketSignalsForMap } from '../repositories/marketHotelRepository.js';
import {
  expireMarketLiveSignals,
  getLatestReleasedMarketLiveSignalAt,
  listReleasedMarketLiveSignals,
  upsertMarketLiveSignals,
} from '../repositories/marketLiveSignalRepository.js';

const REFRESH_TTL_MS = 15 * 60 * 1000;

const SIGNAL_COPY = {
  WEDDING_DEMAND_ZONE: {
    title: (city) => `Wedding momentum rising in ${city}`,
    description: (location) =>
      `Ceremony-led demand is building${location ? ` near ${location}` : ''} and lifting premium booking windows.`,
    recommendedAction:
      'Lift premium room pricing and review wedding-led package inventory.',
  },
  EVENT_DEMAND_ZONE: {
    title: (city) => `Event demand cluster active in ${city}`,
    description: (location) =>
      `Live event movement is building${location ? ` near ${location}` : ''} and increasing city demand.`,
    recommendedAction:
      'Review event-zone pricing and tighten short-window discounting.',
  },
  CORPORATE_EVENT_CLUSTER: {
    title: (city) => `Corporate event pulse active in ${city}`,
    description: (location) =>
      `Business travel and convention demand are building${location ? ` near ${location}` : ''}.`,
    recommendedAction:
      'Push weekday corporate packages and protect negotiated inventory.',
  },
  AIRPORT_DEMAND: {
    title: (city) => `Arrival pulse strengthening in ${city}`,
    description: () => 'Flight-linked movement is pointing to fresh short-stay demand.',
    recommendedAction:
      'Raise same-day and short-stay pricing while monitoring pickup.',
  },
  TOURISM_SPIKE: {
    title: (city) => `Tourism demand building in ${city}`,
    description: () => 'Destination travel momentum is increasing leisure demand in the city.',
    recommendedAction:
      'Protect public pricing and reduce unnecessary leisure discounting.',
  },
  PRICE_PRESSURE: {
    title: (city) => `Rate pressure visible in ${city}`,
    description: () => 'Visible market pressure suggests near-term rate movement.',
    recommendedAction:
      'Review comp-set movement and tighten pricing guardrails.',
  },
  OTA_DEPENDENCE: {
    title: (city) => `OTA pressure elevated in ${city}`,
    description: () => 'Distribution mix suggests elevated OTA-driven demand and margin pressure.',
    recommendedAction:
      'Push direct-channel conversion and protect channel mix.',
  },
  WEEKEND_COMPRESSION: {
    title: (city) => `Weekend compression forming in ${city}`,
    description: () => 'Weekend inventory pressure suggests near-term pricing urgency.',
    recommendedAction:
      'Lift weekend rates and review minimum-stay controls.',
  },
  FESTIVAL_DEMAND: {
    title: (city) => `Festival demand building in ${city}`,
    description: () => 'Festival-linked movement is increasing city visibility and booking intent.',
    recommendedAction:
      'Open premium inventory and review package-led pricing.',
  },
};

function normalizeText(value = '') {
  return String(value || '').trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildCopy(signalType, city, location = '') {
  const configured = SIGNAL_COPY[signalType] || {};
  return {
    title:
      normalizeText(configured.title?.(city)) ||
      normalizeText(signalType).replaceAll('_', ' ') ||
      'Market signal',
    description: normalizeText(configured.description?.(location)),
    recommendedAction: normalizeText(configured.recommendedAction),
  };
}

function shouldRelease(signal = {}) {
  return (
    normalizeText(signal.city) &&
    normalizeText(signal.signalType) &&
    normalizeText(signal.title) &&
    Number(signal.confidenceScore || 0) >= 40 &&
    Number(signal.impactScore || 0) >= 25
  );
}

function marketSignalToLiveRow(signal = {}, city) {
  const signalType = normalizeText(signal.signalType).toUpperCase();
  const copy = buildCopy(signalType, city, signal.location);
  const observedAt = signal.createdAt || signal.timestamp || new Date().toISOString();
  const confidenceScore = clamp(Math.round((Number(signal.intensity || 0.5) || 0.5) * 100), 0, 100);
  const impactScore = clamp(Math.round((Number(signal.intensity || 0.5) || 0.5) * 100), 0, 100);

  return {
    externalKey: `market:${city}:${signalType}:${normalizeText(signal.location)}:${String(observedAt)}`,
    city,
    signalType,
    source: 'market_signal_engine',
    sourceRef: normalizeText(signal.location),
    title: copy.title,
    description: copy.description,
    recommendedAction: copy.recommendedAction,
    impactScore,
    confidenceScore,
    status: shouldRelease({ city, signalType, title: copy.title, confidenceScore, impactScore }) ? 'released' : 'staged',
    observedAt,
    metadata: {
      location: normalizeText(signal.location),
      latitude: signal.latitude ?? null,
      longitude: signal.longitude ?? null,
    },
  };
}

function opportunitySignalToLiveRow(signal = {}, city) {
  const observedAt = signal.created_at || signal.createdAt || new Date().toISOString();
  const confidenceScore = clamp(Math.round(Number(signal.confidence_score ?? signal.confidenceScore ?? 68)), 0, 100);
  const impactScore = clamp(Math.round(Number(signal.impact_score ?? signal.impactScore ?? 0)), 0, 100);

  return {
    externalKey: `opportunity:${city}:${normalizeText(signal.signal_type || signal.signalType)}:${normalizeText(signal.hotel_name || signal.hotelName)}:${String(observedAt)}`,
    city,
    signalType: normalizeText(signal.signal_type || signal.signalType).toUpperCase(),
    source: 'market_opportunity_feed',
    sourceRef: normalizeText(signal.hotel_name || signal.hotelName),
    title: normalizeText(signal.title) || 'Market opportunity',
    description: normalizeText(signal.description),
    recommendedAction: normalizeText(signal.recommended_action || signal.recommendedAction),
    impactScore,
    confidenceScore,
    status: shouldRelease({
      city,
      signalType: signal.signal_type || signal.signalType,
      title: signal.title,
      confidenceScore,
      impactScore,
    })
      ? 'released'
      : 'staged',
    observedAt,
    metadata: {
      hotelId: signal.hotel_id || signal.hotelId || null,
      hotelName: signal.hotel_name || signal.hotelName || null,
      coordinates: signal.coordinates || null,
      latitude: signal.latitude ?? null,
      longitude: signal.longitude ?? null,
    },
  };
}

function externalSignalToLiveRow(signal = {}, city) {
  const observedAt = signal.createdAt || new Date().toISOString();
  const confidenceScore = clamp(Math.round(Number(signal.confidenceScore || 0)), 0, 100);
  const impactScore = clamp(Math.round(Number(signal.impactScore || 0)), 0, 100);

  return {
    externalKey: `external:${city}:${normalizeText(signal.source)}:${normalizeText(signal.signalType)}:${normalizeText(signal.title)}`,
    city,
    signalType: normalizeText(signal.signalType).toUpperCase(),
    source: normalizeText(signal.source) || 'external_intel',
    sourceRef: normalizeText(signal.sourceRef),
    title: normalizeText(signal.title) || 'External intelligence signal',
    description: normalizeText(signal.description),
    recommendedAction: normalizeText(signal.recommendedAction),
    impactScore,
    confidenceScore,
    status: shouldRelease({ city, signalType: signal.signalType, title: signal.title, confidenceScore, impactScore })
      ? 'released'
      : 'staged',
    observedAt,
    metadata: {
      details: Array.isArray(signal.details) ? signal.details : [],
    },
  };
}

const defaultDeps = {
  getLeadRadarExternalSignals,
  getMarketOpportunityFeed,
  listRecentMarketSignalsForMap,
  expireMarketLiveSignals,
  getLatestReleasedMarketLiveSignalAt,
  listReleasedMarketLiveSignals,
  upsertMarketLiveSignals,
};

export async function refreshLeadRadarLiveSignals({ city, force = false } = {}, deps = defaultDeps) {
  const safeCity = normalizeText(city);
  assertCityInScope(safeCity, 'city');

  const latestRelease = await deps.getLatestReleasedMarketLiveSignalAt(safeCity);
  if (!force && latestRelease) {
    const ageMs = Date.now() - new Date(latestRelease).getTime();
    if (ageMs <= REFRESH_TTL_MS) {
      const signals = await deps.listReleasedMarketLiveSignals(safeCity);
      return {
        city: safeCity,
        refreshed: false,
        signals,
        providers: {
          googleSearchEnabled: Boolean(env.googleSearchApiKey && env.googleSearchEngineId),
          googleTrendsEnabled: Boolean(env.enableGoogleTrendsLive || env.googleTrendsSnapshotFile),
        },
      };
    }
  }

  await deps.expireMarketLiveSignals({ city: safeCity });

  const [mapSignals, opportunitiesPayload, externalPayload] = await Promise.all([
    deps.listRecentMarketSignalsForMap({ city: safeCity, limit: 250, hours: 48 }),
    deps.getMarketOpportunityFeed({ city: safeCity, limitPerCity: 30, limit: 60 }),
    deps.getLeadRadarExternalSignals({ city: safeCity }),
  ]);

  const opportunitySignals = Array.isArray(opportunitiesPayload?.opportunities)
    ? opportunitiesPayload.opportunities
    : Array.isArray(opportunitiesPayload)
      ? opportunitiesPayload
      : [];
  const externalSignals = Array.isArray(externalPayload?.signals) ? externalPayload.signals : [];

  const rows = [
    ...mapSignals.map((signal) => marketSignalToLiveRow(signal, safeCity)),
    ...opportunitySignals.map((signal) => opportunitySignalToLiveRow(signal, safeCity)),
    ...externalSignals.map((signal) => externalSignalToLiveRow(signal, safeCity)),
  ];

  const result = await deps.upsertMarketLiveSignals(rows);
  const signals = await deps.listReleasedMarketLiveSignals(safeCity);

  logger.info('leadradar_live_signal_refresh_completed', {
    city: safeCity,
    stagedRows: rows.length,
    releasedRows: signals.length,
    upsertedRows: result.rowCount,
  });

  return {
    city: safeCity,
    refreshed: true,
    signals,
    providers: {
      googleSearchEnabled: Boolean(externalPayload?.providers?.googleSearchEnabled),
      googleTrendsEnabled: Boolean(externalPayload?.providers?.googleTrendsEnabled),
    },
  };
}

export async function getReleasedLeadRadarSignals({ city } = {}, deps = defaultDeps) {
  const payload = await refreshLeadRadarLiveSignals({ city, force: false }, deps);
  return payload;
}
