import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { normalizeOpportunityScore } from '../utils/leadRadarScore.js';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDeltaPayload(payload = {}) {
  return {
    todayTotal: toNumber(payload?.today_total, 0),
    yesterdayTotal: toNumber(payload?.yesterday_total, 0),
    delta: toNumber(payload?.delta, 0),
  };
}

export function normalizeRadarScoreCardPayload(payload = {}, fallbackData = {}) {
  return {
    radarScore: toNumber(payload?.radar_score, toNumber(fallbackData?.radarScore, 0)),
    marketStatus:
      String(
        payload?.market_status ||
          payload?.demand_level ||
          fallbackData?.marketStatus ||
          'Market Watch',
      ).trim() || 'Market Watch',
    recommendedPrice:
      toNullableNumber(payload?.recommended_price) ??
      toNullableNumber(fallbackData?.recommendedPrice),
    positionVsMarket:
      toNullableNumber(payload?.position_vs_market) ??
      toNullableNumber(payload?.position_percent) ??
      toNullableNumber(fallbackData?.positionVsMarket),
    generatedAt: String(payload?.generated_at || fallbackData?.generatedAt || '').trim(),
  };
}

export async function getRadarScoreCard(token, hotelId, fallbackData = {}) {
  const response = await fetch(
    buildApiPath('/api/intelligence/radar-score', { hotel_id: hotelId }),
    {
      headers: buildAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load RADAR score card');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeRadarScoreCardPayload(payload, fallbackData);
}

function normalizeSignalType(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function signalIntensity(entry = {}) {
  const impact = toNumber(entry?.impact_score, 0);
  const confidence = toNumber(entry?.confidence_score, 0);
  const inferred = impact > 0 || confidence > 0 ? (impact + confidence) / 200 : 0;
  return Math.max(0, Math.min(1, inferred));
}

export function normalizeRadarMapPayload(payload = []) {
  const rows = Array.isArray(payload?.signals) ? payload.signals : Array.isArray(payload) ? payload : [];

  return rows
    .map((entry, index) => {
      const latitude = toNumber(entry?.lat ?? entry?.latitude, Number.NaN);
      const longitude = toNumber(entry?.lng ?? entry?.longitude, Number.NaN);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        id:
          String(entry?.id || entry?.hotel_id || '')
            .trim() || `radar-map-${index}`,
        hotelId: String(entry?.hotel_id || '').trim(),
        city: String(entry?.city || 'Unknown').trim() || 'Unknown',
        signalType: normalizeSignalType(entry?.signal_type || entry?.signalType || 'INFORMATIONAL'),
        latitude,
        longitude,
        impactScore: toNumber(entry?.impact_score, 0),
        confidenceScore: toNumber(entry?.confidence_score, 0),
        intensity: signalIntensity(entry),
      };
    })
    .filter(Boolean);
}

export async function getRadarMapSignals(token) {
  const response = await fetch('/api/intelligence/map', {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load RADAR map');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeRadarMapPayload(payload);
}

export function normalizeLeadRadarExternalSignalsPayload(payload = {}) {
  const rows = Array.isArray(payload?.signals) ? payload.signals : [];

  return {
    city: String(payload?.city || '').trim(),
    providers: {
      googleSearchEnabled: Boolean(payload?.providers?.googleSearchEnabled),
      googleTrendsEnabled: Boolean(payload?.providers?.googleTrendsEnabled),
    },
    signals: rows.map((entry, index) => ({
      id:
        String(entry?.id || '')
          .trim() || `lead-external-signal-${index}`,
      city: String(entry?.city || 'Unknown').trim() || 'Unknown',
      source: String(entry?.source || '').trim(),
      signalType: normalizeSignalType(entry?.signalType || entry?.signal_type || 'UNKNOWN'),
      title: String(entry?.title || 'External market signal').trim() || 'External market signal',
      description: String(entry?.description || '').trim(),
      confidenceScore: toNumber(entry?.confidenceScore ?? entry?.confidence_score, 0),
      impactScore: normalizeOpportunityScore(
        toNumber(entry?.impactScore ?? entry?.impact_score, 0),
      ),
      recommendedAction: String(entry?.recommendedAction || entry?.recommended_action || '').trim(),
      createdAt: String(entry?.createdAt || entry?.created_at || entry?.observedAt || entry?.observed_at || '').trim(),
      sourceRef: String(entry?.sourceRef || entry?.source_ref || '').trim(),
      details: Array.isArray(entry?.details)
        ? entry.details
        : Array.isArray(entry?.metadata?.details)
          ? entry.metadata.details
          : [],
      metadata: entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
    })),
  };
}

export async function getLeadRadarExternalSignals(token, city) {
  const response = await fetch(
    buildApiPath('/api/intelligence/leadradar-signals', { city }),
    {
      headers: buildAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load LeadRADAR external signals');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeLeadRadarExternalSignalsPayload(payload);
}

export function normalizeLeadRadarEventsPayload(payload = {}) {
  const rows = Array.isArray(payload?.events) ? payload.events : [];

  return {
    city: String(payload?.city || '').trim(),
    events: rows.map((entry, index) => ({
      id: String(entry?.id || '').trim() || `lead-event-${index}`,
      city: String(entry?.city || '').trim(),
      eventName: String(entry?.event_name || entry?.eventName || '').trim(),
      venue: String(entry?.venue || '').trim(),
      startDate: String(entry?.start_date || entry?.startDate || '').trim(),
      endDate: String(entry?.end_date || entry?.endDate || '').trim(),
      category: String(entry?.category || '').trim(),
      scale: String(entry?.scale || '').trim(),
      source: String(entry?.source || '').trim(),
      confidence: String(entry?.confidence || '').trim(),
      eventUrl: String(entry?.event_url || entry?.eventUrl || '').trim(),
      impactScore: toNumber(entry?.impact_score ?? entry?.impactScore, 0),
    })),
  };
}

export async function getLeadRadarUpcomingEvents(token, city, horizonDays = 15) {
  const response = await fetch(
    buildApiPath('/api/intelligence/leadradar-events', { city, horizonDays }),
    {
      headers: buildAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load LeadRADAR events');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeLeadRadarEventsPayload(payload);
}

export function normalizeSignalsFeedPayload(payload = []) {
  const rows = Array.isArray(payload?.opportunities)
    ? payload.opportunities
    : Array.isArray(payload)
      ? payload
      : [];

  return rows.map((entry, index) => ({
    id:
      String(entry?.id || entry?.hotel_id || '')
        .trim() || `signal-feed-${index}`,
    hotelId: String(entry?.hotel_id || '').trim(),
    city: String(entry?.city || 'Unknown').trim() || 'Unknown',
    signalType: normalizeSignalType(entry?.signal_type || entry?.signalType || 'UNKNOWN'),
    title: String(entry?.title || 'Market signal').trim() || 'Market signal',
    description: String(entry?.description || '').trim(),
    confidenceScore: toNumber(entry?.confidence_score, 0),
    impactScore: normalizeOpportunityScore(
      toNumber(entry?.raw_score, toNumber(entry?.impact_score, 0)),
    ),
    recommendedAction: String(entry?.recommended_action || '').trim(),
    createdAt: String(entry?.created_at || '').trim(),
  }));
}

export async function getSignalsFeed(token) {
  const response = await fetch('/api/intelligence/opportunities', {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load signals feed');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeSignalsFeedPayload(payload);
}

export function normalizeOpportunityFeedPayload(payload = []) {
  const rows = Array.isArray(payload?.opportunities)
    ? payload.opportunities
    : Array.isArray(payload)
      ? payload
      : [];

  return rows
    .map((entry, index) => ({
      id:
        String(entry?.id || entry?.hotel_id || '')
          .trim() || `opportunity-feed-${index}`,
      hotelId: String(entry?.hotel_id || '').trim(),
      hotelName: String(entry?.hotel_name || '').trim(),
      city: String(entry?.city || 'Unknown').trim() || 'Unknown',
      signalType: normalizeSignalType(entry?.signal_type || entry?.signalType || 'UNKNOWN'),
      title: String(entry?.title || 'Revenue opportunity').trim() || 'Revenue opportunity',
      description: String(entry?.description || '').trim(),
      confidenceScore: toNumber(entry?.confidence_score, 0),
      rawScore: toNumber(entry?.raw_score, toNumber(entry?.impact_score, 0)),
      impactScore: normalizeOpportunityScore(
        toNumber(entry?.raw_score, toNumber(entry?.impact_score, 0)),
      ),
      latitude: toNumber(entry?.coordinates?.latitude ?? entry?.latitude, Number.NaN),
      longitude: toNumber(entry?.coordinates?.longitude ?? entry?.longitude, Number.NaN),
      recommendedAction: String(entry?.recommended_action || '').trim(),
      createdAt: String(entry?.created_at || '').trim(),
    }))
    .sort((left, right) => Number(right.impactScore || 0) - Number(left.impactScore || 0));
}

export async function getOpportunityFeed(token, city = '') {
  const response = await fetch(
    buildApiPath('/api/intelligence/opportunities', city ? { city: String(city).trim() } : {}),
    {
      headers: buildAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load opportunity feed');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeOpportunityFeedPayload(payload);
}

function forecastLevel(score) {
  const safeScore = toNumber(score, 0);
  if (safeScore >= 70) return 'Peak';
  if (safeScore >= 40) return 'Moderate';
  return 'Low';
}

function normalizeForecastScore(entry = {}) {
  return Math.max(
    0,
    Math.min(
      100,
      toNumber(
        entry?.demand_score,
        toNumber(entry?.demandScore, toNumber(entry?.score, 0)),
      ),
    ),
  );
}

export function normalizeDemandForecastPayload(payload = []) {
  const forecastRows = Array.isArray(payload?.forecast)
    ? payload.forecast
    : Array.isArray(payload)
      ? payload
      : [];

  const forecast = forecastRows.map((entry, index) => ({
    id: String(entry?.date || '').trim() || `forecast-${index}`,
    date: String(entry?.date || '').trim(),
    demandScore: normalizeForecastScore(entry),
    demandLevel:
      String(entry?.demand_level || entry?.demandLevel || forecastLevel(normalizeForecastScore(entry))).trim() || 'Low',
  }));

  const peakDay = forecast.reduce(
    (best, entry) => (Number(entry.demandScore || 0) > Number(best?.demandScore || -1) ? entry : best),
    null,
  );

  return {
    city: String(payload?.city || '').trim(),
    forecast,
    peakDay,
  };
}

export async function getDemandForecast(token, hotelId) {
  const response = await fetch(
    buildApiPath('/api/intelligence/demand-forecast', { hotel_id: hotelId }),
    {
      headers: buildAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load demand forecast');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeDemandForecastPayload(payload);
}

function normalizeDemandDay(entry = {}, index = 0) {
  const drivers = Array.isArray(entry?.top_drivers) ? entry.top_drivers : [];
  const nullableNumber = (value) => (value == null || value === '' ? null : toNumber(value, null));
  return {
    id: String(entry?.stay_date || '').trim() || `market-demand-${index}`,
    stayDate: String(entry?.stay_date || '').trim(),
    demandScore: toNumber(entry?.demand_score, 0),
    confidenceScore: toNumber(entry?.confidence_score, 0),
    demandLevel: String(entry?.demand_level || 'Normal').trim() || 'Normal',
    pricingAction: String(entry?.pricing_action || 'Need More Data').trim() || 'Need More Data',
    priceAdjustmentPct: toNumber(entry?.price_adjustment_pct, 0),
    trustStatus: String(entry?.trust_status || 'review_only').trim() || 'review_only',
    marketAvgPrice: nullableNumber(entry?.market_avg_price),
    hotelAvgPrice: nullableNumber(entry?.hotel_avg_price),
    competitorCount: toNumber(entry?.competitor_count, 0),
    competitorRateRows: toNumber(entry?.competitor_rate_rows, 0),
    rateChangePct: nullableNumber(entry?.rate_change_pct),
    hotelVsMarketPct: nullableNumber(entry?.hotel_vs_market_pct),
    computedAt: String(entry?.computed_at || '').trim(),
    freshness: entry?.freshness && typeof entry.freshness === 'object' ? entry.freshness : {},
    productLock: entry?.product_lock && typeof entry.product_lock === 'object' ? entry.product_lock : {},
    missingEvidence: Array.isArray(entry?.missing_evidence) ? entry.missing_evidence : [],
    contradictorySignals: Array.isArray(entry?.contradictory_signals) ? entry.contradictory_signals : [],
    moduleScores: entry?.module_scores && typeof entry.module_scores === 'object' ? entry.module_scores : {},
    sourceProof: entry?.source_proof && typeof entry.source_proof === 'object' ? entry.source_proof : {},
    topDrivers: drivers.map((driverEntry, driverIndex) => ({
      id:
        String(driverEntry?.type || '').trim() ||
        String(driverEntry?.label || '').trim() ||
        `driver-${driverIndex}`,
      type: String(driverEntry?.type || '').trim(),
      label: String(driverEntry?.label || 'Demand driver').trim() || 'Demand driver',
      impact: toNumber(driverEntry?.impact, 0),
      evidence: String(driverEntry?.evidence || '').trim(),
      freshness: String(driverEntry?.freshness || '').trim(),
    })),
  };
}

export function normalizeMarketDemandPayload(payload = {}) {
  const rows = Array.isArray(payload?.days) ? payload.days : [];
  return {
    city: String(payload?.city || 'Goa').trim() || 'Goa',
    horizonDays: toNumber(payload?.horizon_days, 30),
    markets: Array.isArray(payload?.markets) ? payload.markets.map((city) => String(city).trim()).filter(Boolean) : [],
    generatedAt: String(payload?.generated_at || '').trim(),
    modelBasis: Array.isArray(payload?.model_basis) ? payload.model_basis : [],
    removedFromPriceAction: Array.isArray(payload?.removed_from_price_action)
      ? payload.removed_from_price_action
      : [],
    dataPolicy: String(payload?.data_policy || '').trim(),
    actionableDays: toNumber(payload?.actionable_days, 0),
    days: rows.map(normalizeDemandDay),
  };
}

export async function getMarketDemand(token, city = 'Goa', horizonDays = 30) {
  const response = await fetch(
    buildApiPath('/api/market-demand', { city, horizonDays }),
    {
      headers: buildAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load market demand');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeMarketDemandPayload(payload);
}

export function normalizeSystemStatusPayload(payload = {}) {
  const liveSources = payload?.live_sources || {};
  return {
    hotelsIndexed: toNumber(payload?.hotels_indexed, 0),
    signalsGenerated: toNumber(payload?.signals_generated, 0),
    rankedOpportunities: toNumber(payload?.ranked_opportunities, 0),
    notificationsGenerated: toNumber(payload?.notifications_generated, 0),
    hotelsDelta: normalizeDeltaPayload(payload?.hotels_delta),
    signalsDelta: normalizeDeltaPayload(payload?.signals_delta),
    rankedOpportunitiesDelta: normalizeDeltaPayload(payload?.ranked_opportunities_delta),
    notificationsDelta: normalizeDeltaPayload(payload?.notifications_delta),
    cityCount: toNumber(payload?.city_count, 0),
    cities: Array.isArray(payload?.cities) ? payload.cities : [],
    scrapeStatus: String(payload?.scrape_status || '').trim(),
    systemMessage: String(payload?.system_message || '').trim(),
    lastHotelScrapeAt: String(payload?.last_hotel_scrape_at || '').trim(),
    lastSignalRefreshAt: String(payload?.last_signal_refresh_at || '').trim(),
    liveSources: {
      totalSources: toNumber(liveSources?.total_sources, 0),
      enabledSources: toNumber(liveSources?.enabled_sources, 0),
      okSources: toNumber(liveSources?.ok_sources, 0),
      partialSources: toNumber(liveSources?.partial_sources, 0),
      failedSources: toNumber(liveSources?.failed_sources, 0),
      neverCheckedSources: toNumber(liveSources?.never_checked_sources, 0),
      lastCheckedAt: String(liveSources?.last_checked_at || '').trim(),
      sources: Array.isArray(liveSources?.sources)
        ? liveSources.sources.map((entry) => ({
            id: String(entry?.id || '').trim(),
            hotelId: String(entry?.hotel_id || '').trim(),
            hotelName: String(entry?.hotel_name || '').trim(),
            city: String(entry?.city || '').trim(),
            sourceType: String(entry?.source_type || '').trim(),
            sourceName: String(entry?.source_name || '').trim(),
            adapterType: String(entry?.adapter_type || '').trim(),
            enabled: Boolean(entry?.enabled),
            cadenceMinutes: toNumber(entry?.cadence_minutes, 0),
            proofRequired: Boolean(entry?.proof_required),
            freshnessMinutes: toNumber(entry?.freshness_minutes, 0),
            lastCheckedAt: String(entry?.last_checked_at || '').trim(),
            lastStatus: String(entry?.last_status || '').trim(),
            lastError: String(entry?.last_error || '').trim(),
          }))
        : [],
    },
    systemTime: String(payload?.system_time || '').trim(),
  };
}

export async function getSystemStatus(token) {
  const response = await fetch('/api/debug/system-status', {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load system status');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeSystemStatusPayload(payload);
}

function normalizePriority(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'high') return 'high';
  if (text === 'medium') return 'medium';
  return 'low';
}

export function normalizeNotificationsPayload(payload = []) {
  const rows = Array.isArray(payload?.notifications)
    ? payload.notifications
    : Array.isArray(payload?.alerts)
      ? payload.alerts
    : Array.isArray(payload)
      ? payload
      : [];

  return rows.map((entry, index) => ({
    id: String(entry?.id || '').trim() || `notification-${index}`,
    title:
      String(entry?.title || entry?.alert_type || 'Market notification')
        .trim()
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Market notification',
    city: String(entry?.city || 'Unknown').trim() || 'Unknown',
    message: String(entry?.message || entry?.recommended_action || '').trim(),
    priority: normalizePriority(entry?.priority || entry?.severity),
    createdAt: String(entry?.created_at || '').trim(),
  }));
}

export async function getNotifications(token) {
  const response = await fetch('/api/intelligence/alerts', {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load notifications');
    throw new Error(parsed.message);
  }

  const payload = await response.json();
  return normalizeNotificationsPayload(payload);
}
