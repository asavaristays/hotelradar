import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { DEFAULT_CALIBRATION, getCalibration } from '../config/calibration.js';
import { listActiveAlerts } from '../repositories/alertRepository.js';
import {
  listDataHealthIssues,
  resolveInactiveDataHealthIssues,
  upsertDataHealthIssue,
} from '../repositories/dataHealthRepository.js';
import {
  getLatestDemandScore,
  getPreviousDemandScore,
  insertDemandScore,
} from '../repositories/demandRepository.js';
import { getPerformance, getValidatedPerformance } from '../repositories/performanceRepository.js';
import { getCanaryOverride, getModelVersionById } from '../repositories/calibrationFasttrackRepository.js';
import {
  getAirfareSeries,
  getCityWeights,
  getCompetitorRatesForHotel,
  getLatestMarketCheckinDate,
  getLatestCompetitorScrapeAt,
  getLatestHotelPrice,
  getUpcomingEvents,
  getUpcomingHolidays,
} from '../repositories/marketRepository.js';
import { getHotelById, touchHotelCalculatedAt } from '../repositories/hotelRepository.js';
import { computeAirfareScore } from './intelligence-engine/airfareEngine.js';
import { aggregateDemand, DEFAULT_CITY_WEIGHTS } from './intelligence-engine/aggregator.js';
import { logAuditTrail } from './intelligence-engine/auditEngine.js';
import { computeCompression } from './intelligence-engine/compressionEngine.js';
import { computeDemandConfidence } from './intelligence-engine/confidenceEngine.js';
import { computeCompetitorScore } from './intelligence-engine/competitorEngine.js';
import { buildForwardCurve } from './intelligence-engine/forwardCurveEngine.js';
import { computeHolidayScore } from './intelligence-engine/holidayEngine.js';
import { buildNarrative } from './intelligence-engine/narrativeEngine.js';
import { updatePerformanceMetrics } from './intelligence-engine/performanceEngine.js';
import { computePricingRecommendation } from './intelligence-engine/pricingEngine.js';
import { computeSeasonScore } from './intelligence-engine/seasonEngine.js';
import { computeSignalBreakdown } from './intelligence-engine/signalBreakdownEngine.js';
import { computeMarketStability } from './intelligence-engine/stabilityEngine.js';
import { evaluateAlerts } from './alertService.js';
import { computeMarketPosition } from './marketPositionService.js';
import { computeOtaParity } from './otaParityService.js';
import { computeDataHealthSnapshot } from './dataHealthService.js';
import { splitRateRows } from './rateSourceService.js';
import { simulateRevenueImpact } from './revenueImpactSimulator.js';
import { average, clamp, round } from '../utils/math.js';
import { getMockCompetitorRates } from '../../mock/mockScraper.js';

const defaultDeps = {
  getHotelById,
  touchHotelCalculatedAt,
  getCompetitorRatesForHotel,
  getLatestHotelPrice,
  getAirfareSeries,
  getUpcomingEvents,
  getUpcomingHolidays,
  getCityWeights,
  getLatestMarketCheckinDate,
  getLatestCompetitorScrapeAt,
  getLatestDemandScore,
  getPreviousDemandScore,
  insertDemandScore,
  getPerformance,
  getValidatedPerformance,
  listActiveAlerts,
  upsertDataHealthIssue,
  resolveInactiveDataHealthIssues,
  listDataHealthIssues,
  evaluateAlerts,
  getMockCompetitorRates,
  getCalibration,
  updatePerformanceMetrics,
  logAuditTrail,
  getCanaryOverride,
  getModelVersionById,
};

function normalizeWeights(city, dbWeights, calibration, overrideWeights = null) {
  if (overrideWeights && Object.keys(overrideWeights).length) {
    const canary = {
      competitor_weight: Number(overrideWeights.competitor_weight || 0),
      holiday_weight: Number(overrideWeights.holiday_weight || 0),
      airfare_weight: Number(overrideWeights.airfare_weight || 0),
      season_weight: Number(overrideWeights.season_weight || 0),
    };
    const total =
      canary.competitor_weight + canary.holiday_weight + canary.airfare_weight + canary.season_weight;
    if (total > 0) return canary;
  }
  return (
    dbWeights ||
    DEFAULT_CITY_WEIGHTS[city] ||
    calibration?.global?.weights?.default ||
    DEFAULT_CITY_WEIGHTS.Mumbai
  );
}

function formatMovement(change) {
  if (change == null || !Number.isFinite(change)) return '0%';
  const rounded = round(change, 1);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function normalizeMarketPosition(raw) {
  return {
    hotelPrice: Number(raw?.hotelPrice || 0),
    marketAvg: Number(raw?.marketAvg ?? raw?.marketAvgPrice ?? 0),
    positionPct: Number(raw?.positionPct || 0),
  };
}

function normalizeSuggestedPricing(raw) {
  const pricing = raw || {};
  return {
    base: Number(pricing.base ?? pricing.basePrice ?? 0),
    bands: pricing.bands || {
      safe: { min: 0, max: 0 },
      aggressive: { min: 0, max: 0 },
      premium: { min: 0, max: 0 },
    },
    riskLevel: pricing.riskLevel || 'Low',
    marketHeat: Number(pricing.marketHeat || 1),
  };
}

function pickCurveScore(forwardCurve = [], index = 0, fallback = 50) {
  if (!Array.isArray(forwardCurve) || !forwardCurve.length) return fallback;
  const safeIndex = Math.max(0, Math.min(Number(index || 0), forwardCurve.length - 1));
  const value = Number(forwardCurve[safeIndex]?.score);
  return Number.isFinite(value) ? value : fallback;
}

function actionToRecommendedScenario(action = '') {
  if (action === 'increase') return 'plus2';
  if (action === 'reduce') return 'minus2';
  return 'maintain';
}

function buildRevenueImpact({
  hotel,
  marketPosition,
  suggestedPricing,
  forwardCurve,
  demandScore,
  action,
}) {
  const fallbackDemand = clamp(Number(demandScore || 50), 0, 100);
  const currentADR = Number(marketPosition?.hotelPrice || suggestedPricing?.base || 0);
  const competitorMedian = Number(marketPosition?.marketAvg || currentADR || 0);
  const roomCount = Number(hotel?.room_count || 0);
  const roomNights = Math.max(1, Math.round((roomCount > 0 ? roomCount : 100) * 7));

  const simulation = simulateRevenueImpact({
    currentADR: Math.max(0, currentADR),
    competitorMedian: Math.max(0, competitorMedian),
    demandSignals: {
      day7: pickCurveScore(forwardCurve, 6, fallbackDemand),
      day14: pickCurveScore(forwardCurve, 13, fallbackDemand),
      day30: pickCurveScore(forwardCurve, 29, fallbackDemand),
    },
    roomNights,
  });

  const findRevenue = (scenarioName) =>
    Number(
      simulation?.revenueScenarios?.find((entry) => entry?.scenario === scenarioName)?.projectedRevenue || 0,
    );

  return {
    maintain: round(findRevenue('Maintain price'), 0),
    plus2: round(findRevenue('+2% price'), 0),
    minus2: round(findRevenue('-2% price'), 0),
    recommended: actionToRecommendedScenario(action),
  };
}

function normalizeMarketContext(raw = {}) {
  return {
    checkinDate: raw?.checkinDate || null,
    observedAt: raw?.observedAt || null,
    lastEventSync: raw?.lastEventSync || null,
    hotelRows: Number(raw?.hotelRows || 0),
    competitorRows: Number(raw?.competitorRows || 0),
    otaRows: Number(raw?.otaRows || 0),
  };
}

function deriveLastEventSync(events = []) {
  let latestMs = null;
  for (const eventRow of events) {
    const raw = eventRow?.scraped_at || eventRow?.scrapedAt || null;
    if (!raw) continue;
    const parsedMs = new Date(raw).getTime();
    if (Number.isNaN(parsedMs)) continue;
    latestMs = latestMs == null ? parsedMs : Math.max(latestMs, parsedMs);
  }
  return latestMs == null ? null : new Date(latestMs).toISOString();
}

function normalizePerformanceSummary(raw) {
  if (!raw) {
    return {
      directionAccuracy: 0,
      alertPrecision: 0,
      positionImprovementPct: 0,
      rollingAccuracy30d: 0,
      stabilityDeviation: 0,
      sampleSize: 0,
      updatedAt: null,
      source: 'unavailable',
    };
  }
  return {
    directionAccuracy: Number(raw.directionAccuracy ?? raw.direction_accuracy ?? 0),
    alertPrecision: Number(raw.alertPrecision ?? raw.alert_precision ?? 0),
    positionImprovementPct: Number(raw.positionImprovementPct ?? raw.position_improvement_pct ?? 0),
    rollingAccuracy30d: Number(raw.rollingAccuracy30d ?? raw.rolling_accuracy_30d ?? 0),
    stabilityDeviation: Number(raw.stabilityDeviation ?? raw.stability_deviation ?? 0),
    sampleSize: Number(raw.sampleSize ?? raw.sample_size ?? 0),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
    source: raw.source || 'operational',
  };
}

function mergePerformanceSummary(operationalRaw, validatedRaw) {
  const operational = normalizePerformanceSummary(operationalRaw);
  const validated = normalizePerformanceSummary(validatedRaw);

  if (validatedRaw) {
    return {
      ...operational,
      directionAccuracy: validated.directionAccuracy,
      rollingAccuracy30d: validated.rollingAccuracy30d,
      stabilityDeviation: validated.stabilityDeviation,
      sampleSize: validated.sampleSize,
      updatedAt: validated.updatedAt || operational.updatedAt,
      source: validated.source || 'validated_outcomes',
      directionSamples: Number(validatedRaw.directionSamples || 0),
    };
  }

  // No validated outcomes yet: keep operational secondary KPIs but suppress forecast-accuracy claims.
  return {
    ...operational,
    directionAccuracy: 0,
    rollingAccuracy30d: 0,
    stabilityDeviation: 0,
    sampleSize: 0,
    source: 'no_validated_outcomes',
  };
}

function normalizeModelVersion(raw) {
  if (!raw) return null;
  const createdAt = raw.created_at ? new Date(raw.created_at) : null;
  const activeDays =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000))
      : 0;

  return {
    id: raw.version_id,
    label: `v${raw.version_no}`,
    status: raw.status || 'canary',
    activeDays,
    createdAt: createdAt ? createdAt.toISOString() : null,
  };
}

function normalizeAlertSeverity(raw = '') {
  const value = String(raw || '').trim().toUpperCase();
  if (value === 'CRITICAL') return 'CRITICAL';
  if (value === 'HIGH') return 'HIGH';
  if (value === 'MEDIUM') return 'MEDIUM';
  if (value === 'LOW') return 'LOW';
  return 'INFO';
}

function summarizeAlerts(alerts = []) {
  const grouped = new Map();

  for (const alert of alerts) {
    const message = String(alert?.message || '').trim();
    if (!message) continue;

    const severity = normalizeAlertSeverity(alert?.severity);
    const key = `${severity}:${message.toLowerCase()}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        severity,
        message,
        count: 1,
      });
    } else {
      grouped.get(key).count += 1;
    }
  }

  return Array.from(grouped.values());
}

function formatAlertSummary(alert) {
  const count = Number(alert?.count || 0);
  const suffix = count > 1 ? ` (x${count})` : '';
  return `${alert.severity}: ${alert.message}${suffix}`;
}

function buildActionSummary(record, marketPosition, signalQuality = null) {
  const level = record.level || 'Moderate';
  const recommendation = record.recommendation || {};
  const action = recommendation.action || 'maintain';
  const confidence = Number(record.confidence || 0);
  const positionPct = Number(marketPosition?.positionPct || 0);

  if (signalQuality?.mode === 'verify') {
    return {
      title: 'Verify Market Before Acting',
      message: signalQuality.summary,
      action: 'verify',
    };
  }

  if (signalQuality?.mode === 'calibrating') {
    return {
      title: 'Calibration In Progress',
      message: signalQuality.summary,
      action: 'calibrating',
    };
  }

  if (action === 'increase') {
    return {
      title: 'Increase Rate',
      message: `${level} demand with confidence ${confidence}. Capture upside while monitoring pickup.`,
      action,
    };
  }
  if (action === 'reduce') {
    return {
      title: 'Defend Occupancy',
      message: `${level} demand and current position ${round(positionPct, 1)}% vs market. Protect conversion.`,
      action,
    };
  }
  return {
    title: 'Hold With Control',
    message: `${level} demand with confidence ${confidence}. Maintain rate and watch 24h movement.`,
    action,
  };
}

function buildChangeSummary(currentRecord, previousRecord) {
  if (!previousRecord) {
    return {
      hasPrevious: false,
      scoreDelta: 0,
      levelChanged: false,
      previousLevel: null,
      currentLevel: currentRecord.level,
      previousUpdatedAt: null,
      currentUpdatedAt: new Date(currentRecord.created_at || Date.now()).toISOString(),
      summary: 'No prior snapshot available for comparison.',
    };
  }

  const currentScore = Number(currentRecord.demand_score || 0);
  const previousScore = Number(previousRecord.demand_score || 0);
  const scoreDelta = round(currentScore - previousScore, 2);
  const previousPosition = Number(previousRecord?.market_position?.positionPct || 0);
  const currentPosition = Number(currentRecord?.market_position?.positionPct || 0);
  const positionDelta = round(currentPosition - previousPosition, 2);
  const levelChanged = currentRecord.level !== previousRecord.level;

  const direction = scoreDelta > 0 ? 'up' : scoreDelta < 0 ? 'down' : 'flat';
  const summary =
    direction === 'flat'
      ? `Demand score is unchanged at ${currentScore.toFixed(2)}.`
      : `Demand score moved ${direction} by ${Math.abs(scoreDelta).toFixed(2)} points since the last snapshot.`;

  return {
    hasPrevious: true,
    scoreDelta,
    positionDeltaPct: positionDelta,
    levelChanged,
    previousLevel: previousRecord.level,
    currentLevel: currentRecord.level,
    previousUpdatedAt: new Date(previousRecord.created_at || Date.now()).toISOString(),
    currentUpdatedAt: new Date(currentRecord.created_at || Date.now()).toISOString(),
    summary,
  };
}

function buildSignals({ hotel, record, competitorRates, airfareSeries, holidays, events }) {
  const monthlyWeights = hotel.monthly_weights_json || null;
  const seasonProfileMonthly = monthlyWeights
    ? [
        monthlyWeights.jan,
        monthlyWeights.feb,
        monthlyWeights.mar,
        monthlyWeights.apr,
        monthlyWeights.may,
        monthlyWeights.jun,
        monthlyWeights.jul,
        monthlyWeights.aug,
        monthlyWeights.sep,
        monthlyWeights.oct,
        monthlyWeights.nov,
        monthlyWeights.dec,
      ].map((n) => Number(n ?? 50))
    : null;

  return {
    competitor: record.signals?.competitor || computeCompetitorScore(competitorRates),
    holiday: record.signals?.holiday || computeHolidayScore({ city: hotel.city, holidays, events }),
    airfare: record.signals?.airfare || computeAirfareScore({ city: hotel.city, series: airfareSeries }),
    season:
      record.signals?.season ||
      computeSeasonScore({
        city: hotel.city,
        seasonProfileMonthly,
      }),
  };
}

function toDashboardContract({
  hotel,
  record,
  alerts,
  competitiveGrid,
  confidence,
  marketStability,
  compression,
  signalBreakdown,
  forwardCurve,
  narrative,
  performanceSummary,
  viewerRole,
  lastScrapedAt,
  previousRecord,
  modelVersion,
  otaParity,
  dataHealth,
  marketContext,
}) {
  const explanation = Array.isArray(record.explanation)
    ? record.explanation
    : typeof record.explanation === 'string'
      ? [record.explanation]
      : [];
  const normalizedPerf = normalizePerformanceSummary(performanceSummary);
  const normalizedSuggestedPricing = normalizeSuggestedPricing(record.recommendation);
  const normalizedMarketPosition = normalizeMarketPosition(record.market_position);
  const revenueImpact = buildRevenueImpact({
    hotel,
    marketPosition: normalizedMarketPosition,
    suggestedPricing: normalizedSuggestedPricing,
    forwardCurve,
    demandScore: Number(record.demand_score || 0),
    action: record?.recommendation?.action || 'maintain',
  });
  const alertSummary = summarizeAlerts(alerts);
  const confidenceWithForecast = {
    ...confidence,
    forecastAccuracy60d: Number(normalizedPerf.rollingAccuracy30d || 0),
    volatilityError: Number(normalizedPerf.stabilityDeviation || 0),
  };

  return {
    hotelId: hotel.id,
    city: hotel.city,
    seasonProfile: hotel.season_profile_name || 'Default',
    demandScore: Number(record.demand_score),
    demandLevel: record.level,
    confidence: confidenceWithForecast,
    marketStability,
    compression,
    suggestedPricing: normalizedSuggestedPricing,
    marketPosition: normalizedMarketPosition,
    revenueImpact,
    signalBreakdown,
    forwardCurve,
    narrative,
    actionSummary: buildActionSummary(record, record.market_position, dataHealth?.signalQuality),
    changeSummary: buildChangeSummary(record, previousRecord),
    competitiveGrid,
    otaParity: otaParity || null,
    dataHealth: dataHealth || null,
    signalQuality: dataHealth?.signalQuality || null,
    marketContext: normalizeMarketContext(marketContext),
    explanation,
    alerts: alertSummary.map(formatAlertSummary),
    alertGroups: alertSummary,
    performanceSummary: normalizedPerf,
    modelVersion: normalizeModelVersion(modelVersion),
    viewerRole: viewerRole || null,
    lastScrapedAt: lastScrapedAt ? new Date(lastScrapedAt).toISOString() : null,
    lastUpdated: new Date(record.created_at || Date.now()).toISOString(),
  };
}

async function fetchCompetitorRatesWithFallback(hotelInput, deps) {
  const hotelId = typeof hotelInput === 'string' ? hotelInput : hotelInput?.id;
  const savedRates = await deps.getCompetitorRatesForHotel(hotelId);
  if (savedRates.length) {
    return savedRates;
  }

  if (!env.allowMockCompetitorFallback) {
    logger.warn('mock_competitor_fallback_disabled', {
      hotelId,
      nodeEnv: env.nodeEnv,
    });
    return [];
  }

  try {
    const scraped = await deps.getMockCompetitorRates(hotelId, {
      city: typeof hotelInput === 'string' ? '' : hotelInput?.city,
      hotelName: typeof hotelInput === 'string' ? '' : hotelInput?.hotel_name,
      basePriceMin: typeof hotelInput === 'string' ? null : hotelInput?.base_price_min,
      basePriceMax: typeof hotelInput === 'string' ? null : hotelInput?.base_price_max,
      compSet: typeof hotelInput === 'string' ? [] : hotelInput?.comp_set_json,
    });
    if (Array.isArray(scraped) && scraped.length) return scraped;
  } catch (error) {
    logger.warn('scraper_fallback_failed', { hotelId, error: error.message });
  }

  return [];
}

async function loadMarketScope(hotel, deps = defaultDeps) {
  const latestMarketCheckin = deps.getLatestMarketCheckinDate
    ? await deps.getLatestMarketCheckinDate(hotel.id)
    : null;
  const checkinDate = latestMarketCheckin?.checkin_date || null;

  const [allRates, hotelPriceRaw, lastScrapedAt] = await Promise.all([
    fetchCompetitorRatesWithFallback(hotel, {
      ...deps,
      getCompetitorRatesForHotel: (hotelId) =>
        deps.getCompetitorRatesForHotel(hotelId, { checkinDate }),
    }),
    deps.getLatestHotelPrice(hotel.id, { checkinDate }),
    deps.getLatestCompetitorScrapeAt
      ? deps.getLatestCompetitorScrapeAt(hotel.id, { checkinDate })
      : Promise.resolve(null),
  ]);

  const segmented = splitRateRows(allRates);
  const observedAt = latestMarketCheckin?.observed_at || lastScrapedAt || null;

  return {
    checkinDate,
    observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    hotelRows: Number(latestMarketCheckin?.hotel_rows || 0),
    competitorRows: segmented.hotelCompetitorRates.length,
    otaRows: segmented.otaParityRates.length,
    allRates,
    hotelCompetitorRates: segmented.hotelCompetitorRates,
    otaParityRates: segmented.otaParityRates,
    hotelPriceRaw,
    lastScrapedAt,
  };
}

export async function getCompetitiveGrid(hotelId, deps = defaultDeps, preloadedScope = null) {
  const hotel = await deps.getHotelById(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const marketScope = preloadedScope || (await loadMarketScope(hotel, deps));
  const competitorRates = marketScope.hotelCompetitorRates;
  const hotelPriceRaw = marketScope.hotelPriceRaw;

  const hotelPrice = Number(hotelPriceRaw || 0);
  const competitorPrices = competitorRates.map((row) => Number(row.price_today || 0)).filter((price) => price > 0);
  const marketAvg = competitorPrices.length ? average(competitorPrices) : hotelPrice;

  const ownRow = {
    name: hotel.hotel_name,
    price: round(hotelPrice, 0),
    movement48h: '0%',
    positionPct: marketAvg > 0 ? round(((hotelPrice - marketAvg) / marketAvg) * 100, 2) : 0,
    occupancyProxy: marketAvg > 0 ? clamp(100 - Math.max(0, (hotelPrice - marketAvg) / marketAvg) * 80, 35, 95) : 60,
  };

  const seen = new Set();
  const competitorRows = [];
  for (const row of competitorRates) {
    const name = row.competitor_name || row.id;
    if (seen.has(name)) continue;
    seen.add(name);

    const today = Number(row.price_today || 0);
    const old = Number(row.price_48h_ago || 0);
    const change = old > 0 ? ((today - old) / old) * 100 : 0;

    competitorRows.push({
      name,
      price: round(today, 0),
      movement48h: formatMovement(change),
      positionPct: marketAvg > 0 ? round(((today - marketAvg) / marketAvg) * 100, 2) : 0,
      occupancyProxy: marketAvg > 0 ? clamp(100 - Math.max(0, (today - marketAvg) / marketAvg) * 75, 35, 95) : 60,
    });
  }

  return [ownRow, ...competitorRows];
}

async function buildDerivedIntelligence({
  hotel,
  record,
  competitorRates,
  airfareSeries,
  holidays,
  events,
  weights,
  marketPosition,
  calibration,
}) {
  const signals = buildSignals({ hotel, record, competitorRates, airfareSeries, holidays, events });
  const compression = computeCompression({
    competitorRates,
    marketPosition,
    calibration,
  });
  const pricing = normalizeSuggestedPricing(record.recommendation);
  const narrative = buildNarrative({
    demandScore: Number(record.demand_score),
    demandLevel: record.level,
    signalBreakdown: computeSignalBreakdown({ signals, weights }),
    compression,
    riskLevel: pricing.riskLevel,
    stabilityStatus: computeMarketStability({ competitorRates }).status,
    seasonProfile: hotel.season_profile_name || hotel.city,
    marketPosition,
    suggestedPricing: pricing,
  });

  return {
    confidence: computeDemandConfidence({
      competitorRates,
      airfareSeries,
      holidays,
      signals,
      calibration,
      seasonProfileBias: Number(hotel.confidence_bias || 0),
    }),
    marketStability: computeMarketStability({
      competitorRates,
    }),
    signalBreakdown: computeSignalBreakdown({
      signals,
      weights,
    }),
    forwardCurve: buildForwardCurve({
      baseDemandScore: Number(record.demand_score),
      competitorDirection: signals.competitor.direction,
      competitorAvgChange: Number(signals.competitor.avgChangePct || 0),
      seasonScore: Number(signals.season.score || 50),
      holidays,
      events,
      city: hotel.city,
    }),
    compression,
    narrative,
    signals,
  };
}

async function buildDashboardResponse(hotel, record, deps, preloaded = {}, context = {}) {
  const performanceGetter = deps.getPerformance || (async () => null);
  const marketScope = preloaded.marketScope || (await loadMarketScope(hotel, deps));
  const competitorRates = preloaded.competitorRates || marketScope.hotelCompetitorRates;
  const otaParityRates = preloaded.otaParityRates || marketScope.otaParityRates;
  const [airfareSeries, holidays, events, cityWeights, alerts, competitiveGrid, calibration, previousRecord, canaryOverride] = await Promise.all([
    preloaded.airfareSeries || deps.getAirfareSeries(hotel.city),
    preloaded.holidays || deps.getUpcomingHolidays(hotel.city),
    preloaded.events || (deps.getUpcomingEvents ? deps.getUpcomingEvents(hotel.city) : Promise.resolve([])),
    preloaded.cityWeights || deps.getCityWeights(hotel.city),
    deps.listActiveAlerts(hotel.id, 20),
    getCompetitiveGrid(hotel.id, deps, marketScope),
    preloaded.calibration || (deps.getCalibration ? deps.getCalibration() : Promise.resolve(DEFAULT_CALIBRATION)),
    preloaded.previousRecord ||
      (deps.getPreviousDemandScore
        ? deps.getPreviousDemandScore(hotel.id, record.id || null)
        : Promise.resolve(null)),
    deps.getCanaryOverride ? deps.getCanaryOverride(hotel.id) : Promise.resolve(null),
  ]);

  const marketPosition = normalizeMarketPosition(record.market_position);
  const weights = normalizeWeights(
    hotel.city,
    cityWeights,
    calibration,
    canaryOverride?.enabled ? canaryOverride.override_weights : null,
  );
  const derived = await buildDerivedIntelligence({
    hotel,
    record,
    competitorRates,
    airfareSeries,
    holidays,
    events,
    weights,
    marketPosition,
    calibration,
  });
  const [performanceSummaryRaw, validatedPerformanceSummary] = await Promise.all([
    performanceGetter(hotel.id),
    deps.getValidatedPerformance
      ? deps.getValidatedPerformance(hotel.id, 60)
      : Promise.resolve(null),
  ]);
  const performanceSummary = mergePerformanceSummary(
    performanceSummaryRaw,
    validatedPerformanceSummary,
  );
  const modelVersion =
    canaryOverride?.model_version_id && deps.getModelVersionById
      ? await deps.getModelVersionById(canaryOverride.model_version_id)
      : null;
  const otaParity = computeOtaParity({
    hotelPrice: marketPosition.hotelPrice,
    competitorRates: otaParityRates,
    parityThresholdPct: Number(calibration?.global?.thresholds?.otaParityParityBand || 2),
    alertThresholdPct: Number(calibration?.global?.thresholds?.otaParityGap || 5),
    lastScrapedAt: marketScope.lastScrapedAt,
    marketAvgPrice: marketPosition.marketAvg,
    allowEstimateFallback: env.allowEstimatedOtaParity,
  });
  const dataHealth = await computeDataHealthSnapshot(
    {
      hotelId: hotel.id,
      viewerRole: context.user_role || 'hotel_user',
      calibration,
      competitorRates,
      otaParityRates,
      airfareSeries,
      lastScrapedAt: marketScope.lastScrapedAt,
      otaParity,
      confidence: derived.confidence,
      marketStability: derived.marketStability,
      performanceSummary,
    },
    {
      upsertDataHealthIssue: deps.upsertDataHealthIssue,
      resolveInactiveDataHealthIssues: deps.resolveInactiveDataHealthIssues,
      listDataHealthIssues: deps.listDataHealthIssues,
    },
  );
  const marketContext = {
    ...marketScope,
    lastEventSync: deriveLastEventSync(events),
  };

  return toDashboardContract({
    hotel,
    record,
    alerts,
    competitiveGrid,
    confidence: derived.confidence,
    marketStability: derived.marketStability,
    compression: derived.compression,
    signalBreakdown: derived.signalBreakdown,
    forwardCurve: derived.forwardCurve,
    narrative: derived.narrative,
    performanceSummary,
    viewerRole: context.user_role || null,
    lastScrapedAt: marketScope.lastScrapedAt,
    previousRecord,
    modelVersion,
    otaParity,
    dataHealth,
    marketContext,
  });
}

export async function recalculateDashboard(hotelId, context = {}, deps = defaultDeps) {
  const startedAt = Date.now();
  logger.info('recalculation_started', { hotelId, context });

  const hotel = await deps.getHotelById(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const marketScope = await loadMarketScope(hotel, deps);
  const competitorRates = marketScope.hotelCompetitorRates;
  const otaParityRates = marketScope.otaParityRates;

  const [hotelPriceRaw, airfareSeries, holidays, events, cityWeights, previousDemand, calibration, canaryOverride] = await Promise.all([
    Promise.resolve(marketScope.hotelPriceRaw),
    deps.getAirfareSeries(hotel.city),
    deps.getUpcomingHolidays(hotel.city),
    deps.getUpcomingEvents ? deps.getUpcomingEvents(hotel.city) : Promise.resolve([]),
    deps.getCityWeights(hotel.city),
    deps.getLatestDemandScore(hotel.id),
    deps.getCalibration ? deps.getCalibration() : getCalibration(),
    deps.getCanaryOverride ? deps.getCanaryOverride(hotel.id) : Promise.resolve(null),
  ]);
  const weights = normalizeWeights(
    hotel.city,
    cityWeights,
    calibration,
    canaryOverride?.enabled ? canaryOverride.override_weights : null,
  );

  const signals = {
    competitor: computeCompetitorScore(competitorRates),
    holiday: computeHolidayScore({ city: hotel.city, holidays, events }),
    airfare: computeAirfareScore({ city: hotel.city, series: airfareSeries }),
    season: computeSeasonScore({
      city: hotel.city,
      seasonProfileMonthly: hotel.monthly_weights_json
        ? [
            hotel.monthly_weights_json.jan,
            hotel.monthly_weights_json.feb,
            hotel.monthly_weights_json.mar,
            hotel.monthly_weights_json.apr,
            hotel.monthly_weights_json.may,
            hotel.monthly_weights_json.jun,
            hotel.monthly_weights_json.jul,
            hotel.monthly_weights_json.aug,
            hotel.monthly_weights_json.sep,
            hotel.monthly_weights_json.oct,
            hotel.monthly_weights_json.nov,
            hotel.monthly_weights_json.dec,
          ].map((n) => Number(n ?? 50))
        : null,
    }),
  };

  const aggregated = aggregateDemand({
    city: hotel.city,
    weights,
    signals,
  });

  const marketPosition = computeMarketPosition(hotelPriceRaw, competitorRates);
  const otaParity = computeOtaParity({
    hotelPrice: marketPosition.hotelPrice,
    competitorRates: otaParityRates,
    parityThresholdPct: Number(calibration?.global?.thresholds?.otaParityParityBand || 2),
    alertThresholdPct: Number(calibration?.global?.thresholds?.otaParityGap || 5),
    lastScrapedAt: marketScope.lastScrapedAt,
    marketAvgPrice: marketPosition.marketAvg,
    allowEstimateFallback: env.allowEstimatedOtaParity,
  });
  const pricing = computePricingRecommendation({
    demandScore: aggregated.demandScore,
    demandLevel: aggregated.level,
    hotelPrice: marketPosition.hotelPrice,
    marketAvgPrice: marketPosition.marketAvg,
    competitorMomentum: signals.competitor,
    holidayScore: signals.holiday.score,
    airfareScore: signals.airfare.score,
    city: hotel.city,
    calibration,
  });

  const demandRecord = await deps.insertDemandScore({
    hotelId: hotel.id,
    demandScore: aggregated.demandScore,
    level: aggregated.level,
    recommendation: pricing,
    confidence: aggregated.confidence,
    explanation: aggregated.explanation,
    marketPosition,
    signals,
  });

  const alertResult = await deps.evaluateAlerts({
    hotel,
    currentDemandScore: aggregated.demandScore,
    previousDemandScore: previousDemand ? Number(previousDemand.demand_score) : null,
    competitorAvgChange: Number(signals.competitor.avgChangePct || 0),
    marketPositionPct: Number(marketPosition.positionPct || 0),
    surgeWindow: Boolean(signals.holiday.surgeWindow),
    otaMaxGapPct: Number(otaParity?.summary?.maxAbsGapPct || 0),
    otaGapThreshold: Number(calibration?.global?.thresholds?.otaParityGap || 5),
  });

  logger.info('recalculation_completed', {
    hotelId,
    demandScore: round(aggregated.demandScore),
    demandLevel: aggregated.level,
  });

  const performanceUpdater = deps.updatePerformanceMetrics;
  const performanceSummary = performanceUpdater
    ? await performanceUpdater({
        hotelId: hotel.id,
        recommendationAction: pricing.action,
        competitorDirection: signals.competitor.direction,
        alertCount: alertResult.created?.length || 0,
        demandLevel: aggregated.level,
        positionPct: Number(marketPosition.positionPct || 0),
        suggestedBase: Number(pricing.base || 0),
        marketAvg: Number(marketPosition.marketAvg || 0),
        stabilityVolatility: Number(signals.competitor.stdDevPct || 0),
      })
    : {
        directionAccuracy: 0,
        alertPrecision: 0,
        positionImprovementPct: 0,
        rollingAccuracy30d: 0,
        stabilityDeviation: 0,
        sampleSize: 0,
        updatedAt: null,
      };

  const auditLogger = deps.logAuditTrail;
  if (auditLogger) {
    await auditLogger({
      hotelId: hotel.id,
      userId: context.user_id || null,
      triggerSource: context.source || context.triggered_by || 'api',
      executionMs: Date.now() - startedAt,
      resultPayload: {
        hotelId: hotel.id,
        demandScore: aggregated.demandScore,
        level: aggregated.level,
        recommendation: pricing,
        marketPosition,
        signals,
        performanceSummary,
      },
      metadata: {
        triggered_by: context.triggered_by || 'manual',
        alert_created_count: alertResult.created?.length || 0,
      },
    });
  }

  if (deps.touchHotelCalculatedAt) {
    await deps.touchHotelCalculatedAt(hotel.id);
  }

  return buildDashboardResponse(
    hotel,
    demandRecord,
    deps,
    {
      marketScope,
      competitorRates,
      otaParityRates,
      airfareSeries,
      holidays,
      events,
      cityWeights: weights,
      calibration,
      previousRecord: previousDemand,
    },
    context,
  );
}

export async function getDashboard(hotelId, context = {}, deps = defaultDeps) {
  const hotel = await deps.getHotelById(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const latest = await deps.getLatestDemandScore(hotelId);
  if (!latest) {
    return recalculateDashboard(
      hotelId,
      { ...context, triggered_by: 'dashboard', source: 'on-demand' },
      deps,
    );
  }

  if (!latest.recommendation?.base && !latest.recommendation?.basePrice) {
    return recalculateDashboard(
      hotelId,
      { ...context, triggered_by: 'dashboard', source: 'pricing-upgrade' },
      deps,
    );
  }

  if (!latest.market_position || !latest.signals) {
    return recalculateDashboard(
      hotelId,
      { ...context, triggered_by: 'dashboard', source: 'v3-contract-sync' },
      deps,
    );
  }

  return buildDashboardResponse(hotel, latest, deps, {}, context);
}

export async function getAlerts(hotelId, deps = defaultDeps) {
  return deps.listActiveAlerts(hotelId, 20);
}

export async function getPerformanceSummary(hotelId, deps = defaultDeps) {
  const [operationalRow, validatedRow] = await Promise.all([
    (deps.getPerformance || (async () => null))(hotelId),
    deps.getValidatedPerformance
      ? deps.getValidatedPerformance(hotelId, 60)
      : Promise.resolve(null),
  ]);
  return mergePerformanceSummary(operationalRow, validatedRow);
}

export async function getDataHealth(hotelId, context = {}, deps = defaultDeps) {
  const dashboard = await getDashboard(hotelId, context, deps);
  return dashboard?.dataHealth || null;
}

export async function getOtaParity(hotelId, deps = defaultDeps) {
  const hotel = await deps.getHotelById(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const [marketScope, calibration] = await Promise.all([
    loadMarketScope(hotel, deps),
    deps.getCalibration ? deps.getCalibration() : getCalibration(),
  ]);
  const competitorRates = marketScope.otaParityRates;
  const hotelPriceRaw = marketScope.hotelPriceRaw;

  const marketAvg = average(
    competitorRates
      .map((row) => Number(row.price_today || 0))
      .filter((price) => Number.isFinite(price) && price > 0),
  );

  return computeOtaParity({
    hotelPrice: Number(hotelPriceRaw || 0),
    competitorRates,
    parityThresholdPct: Number(calibration?.global?.thresholds?.otaParityParityBand || 2),
    alertThresholdPct: Number(calibration?.global?.thresholds?.otaParityGap || 5),
    lastScrapedAt: marketScope.lastScrapedAt,
    marketAvgPrice: Number.isFinite(marketAvg) ? marketAvg : Number(hotelPriceRaw || 0),
    allowEstimateFallback: env.allowEstimatedOtaParity,
  });
}
