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
import { computePricingRecommendation, ensureOrderedBands } from './intelligence-engine/pricingEngine.js';
import { computeSeasonScore } from './intelligence-engine/seasonEngine.js';
import { computeSignalBreakdown } from './intelligence-engine/signalBreakdownEngine.js';
import { computeMarketStability } from './intelligence-engine/stabilityEngine.js';
import { evaluateAlerts } from './alertService.js';
import { computeMarketPosition } from './marketPositionService.js';
import { computeOtaParity } from './otaParityService.js';
import { computeDataHealthSnapshot } from './dataHealthService.js';
import { buildSignalDiagnostics } from './signalDiagnosticsService.js';
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
  getSignalDiagnostics: buildSignalDiagnostics,
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
  const hotelPrice = toFiniteNumber(raw?.hotelPrice ?? raw?.hotel_price, 0);
  const marketAvg = toFiniteNumber(raw?.marketAvg ?? raw?.marketAvgPrice ?? raw?.market_avg, 0);
  const positionPctRaw = toFiniteNumber(raw?.positionPct ?? raw?.position_pct, Number.NaN);
  const positionPct =
    Number.isFinite(positionPctRaw) || marketAvg <= 0
      ? positionPctRaw
      : ((hotelPrice - marketAvg) / marketAvg) * 100;

  return {
    hotelPrice: hotelPrice > 0 ? round(hotelPrice, 0) : 0,
    marketAvg: marketAvg > 0 ? round(marketAvg, 0) : 0,
    positionPct: Number.isFinite(positionPct) ? round(positionPct, 2) : 0,
  };
}

function normalizeSuggestedPricing(raw) {
  const pricing = raw || {};

  const base = toFiniteNumber(pricing.base ?? pricing.basePrice, 0);
  const parseBand = (band = {}) => ({
    min: toFiniteNumber(band.min, 0),
    max: toFiniteNumber(band.max, 0),
  });
  const defaultBands = {
    safe: { min: 0, max: 0 },
    aggressive: { min: 0, max: 0 },
    premium: { min: 0, max: 0 },
  };
  const parsedBands = pricing.bands
    ? {
        safe: parseBand(pricing.bands.safe),
        aggressive: parseBand(pricing.bands.aggressive),
        premium: parseBand(pricing.bands.premium),
      }
    : defaultBands;
  const hasAnyBandValue =
    parsedBands.safe.min > 0 ||
    parsedBands.safe.max > 0 ||
    parsedBands.aggressive.min > 0 ||
    parsedBands.aggressive.max > 0 ||
    parsedBands.premium.min > 0 ||
    parsedBands.premium.max > 0;
  const bands = hasAnyBandValue ? ensureOrderedBands(parsedBands) : defaultBands;

  return {
    base,
    bands,
    riskLevel: pricing.riskLevel || 'Low',
    marketHeat: toFiniteNumber(pricing.marketHeat, 1),
  };
}

function toFiniteNumber(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.+-]/g, '');
    if (!cleaned) return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const marketHotelPrice = toFiniteNumber(marketPosition?.hotelPrice, 0);
  const suggestedBase = toFiniteNumber(suggestedPricing?.base ?? suggestedPricing?.basePrice, 0);
  const marketAvg = toFiniteNumber(marketPosition?.marketAvg ?? marketPosition?.marketAvgPrice, 0);
  let currentADR = marketHotelPrice > 0 ? marketHotelPrice : suggestedBase;
  let estimated = false;
  let reason = null;

  if (currentADR <= 0 && marketAvg > 0) {
    currentADR = marketAvg;
    estimated = true;
    reason = 'Using market average fallback because hotel price snapshot is unavailable for this stay date.';
  }

  if (currentADR <= 0) {
    return {
      maintain: 0,
      plus2: 0,
      minus2: 0,
      recommended: actionToRecommendedScenario(action),
      available: false,
      estimated: true,
      reason: 'Insufficient ADR data for revenue projection.',
    };
  }

  const competitorMedian = marketAvg > 0 ? marketAvg : currentADR;
  const roomCount = toFiniteNumber(hotel?.room_count, 0);
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

  const maintain = round(findRevenue('Maintain price'), 0);
  const plus2 = round(findRevenue('+2% price'), 0);
  const minus2 = round(findRevenue('-2% price'), 0);
  const allZero = maintain <= 0 && plus2 <= 0 && minus2 <= 0;
  if (allZero) {
    return {
      maintain: 0,
      plus2: 0,
      minus2: 0,
      recommended: actionToRecommendedScenario(action),
      available: false,
      estimated: true,
      reason: 'Insufficient ADR data for revenue projection.',
    };
  }

  return {
    maintain,
    plus2,
    minus2,
    recommended: actionToRecommendedScenario(action),
    available: true,
    estimated,
    reason,
    basis: {
      assumedRooms: roomCount > 0 ? roomCount : 100,
      roomNights,
      baselineOccupancy: Number(simulation?.baselineOccupancy || 0),
      adrUsed: round(currentADR, 0),
    },
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
  const staleWindowMs = 72 * 60 * 60 * 1000;

  for (const alert of alerts) {
    const message = String(alert?.message || '').trim();
    if (!message) continue;

    const alertType = String(alert?.alert_type || '').trim().toLowerCase();
    if (alertType === 'surge_window') {
      const createdAtMs = new Date(alert?.created_at || 0).getTime();
      if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > staleWindowMs) {
        continue;
      }
    }

    const severity = normalizeAlertSeverity(alert?.severity);
    const key = `${severity}:${message.toLowerCase()}`;
    const createdAt = alert?.created_at ? new Date(alert.created_at).toISOString() : null;
    if (!grouped.has(key)) {
      grouped.set(key, {
        severity,
        message,
        count: 1,
        firstSeenAt: createdAt,
        lastSeenAt: createdAt,
      });
    } else {
      const entry = grouped.get(key);
      entry.count += 1;
      if (createdAt) {
        if (!entry.firstSeenAt || new Date(createdAt).getTime() < new Date(entry.firstSeenAt).getTime()) {
          entry.firstSeenAt = createdAt;
        }
        if (!entry.lastSeenAt || new Date(createdAt).getTime() > new Date(entry.lastSeenAt).getTime()) {
          entry.lastSeenAt = createdAt;
        }
      }
    }
  }

  return Array.from(grouped.values()).map((entry) => {
    if (entry.severity === 'MEDIUM' || entry.severity === 'LOW' || entry.severity === 'INFO') {
      return {
        ...entry,
        count: 1,
      };
    }
    return entry;
  });
}

function formatAlertSummary(alert) {
  const count = Number(alert?.count || 0);
  const suffix = count > 1 ? ` (x${count})` : '';
  return `${alert.severity}: ${alert.message}${suffix}`;
}

const PRODUCT_LOCK_FOCUS_CITY_KEYS = new Set(['goa', 'mumbai']);
const OUTPUT_GUARD_STALE_SURGE_DAYS = 3;
const NARRATIVE_FIELDS = ['summary', 'marketStory', 'pricingRationale', 'actionGuidance'];

function normalizeCityKey(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeSentenceKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(value = '') {
  return String(value || '')
    .split(/[.!?]+/)
    .map((entry) => normalizeSentenceKey(entry))
    .filter(Boolean);
}

function collectNarrativeDuplicates(narrative = {}) {
  const seen = new Map();
  const duplicates = new Set();

  for (const field of NARRATIVE_FIELDS) {
    const sentences = splitSentences(narrative?.[field] || '');
    for (const sentence of sentences) {
      const count = Number(seen.get(sentence) || 0) + 1;
      seen.set(sentence, count);
      if (count > 1) {
        duplicates.add(sentence);
      }
    }
  }

  return Array.from(duplicates);
}

function countStaleSurgeAlerts(alerts = []) {
  const staleWindowMs = OUTPUT_GUARD_STALE_SURGE_DAYS * 24 * 60 * 60 * 1000;
  return alerts.filter((alert) => {
    const type = String(alert?.alert_type || '').trim().toLowerCase();
    if (type !== 'surge_window') return false;
    const createdAtMs = new Date(alert?.created_at || 0).getTime();
    return Number.isFinite(createdAtMs) && Date.now() - createdAtMs > staleWindowMs;
  }).length;
}

function collectCriticalOutputGaps({
  suggestedPricing,
  marketPosition,
  marketContext,
  forwardCurve,
}) {
  const gaps = [];
  const base = Number(suggestedPricing?.base || 0);
  const marketAvg = Number(marketPosition?.marketAvg || 0);
  const curveSize = Array.isArray(forwardCurve) ? forwardCurve.length : 0;

  if (!Number.isFinite(base) || base <= 0) {
    gaps.push('suggested base price is missing');
  }
  if (!Number.isFinite(marketAvg) || marketAvg <= 0) {
    gaps.push('market average is unavailable for selected stay date');
  }
  if (!marketContext?.checkinDate) {
    gaps.push('stay-date basis is missing');
  }
  if (curveSize < 7) {
    gaps.push('forward demand curve is incomplete');
  }

  return gaps;
}

function buildOutputGuard({
  city,
  alerts,
  narrative,
  suggestedPricing,
  marketPosition,
  marketContext,
  forwardCurve,
}) {
  if (!PRODUCT_LOCK_FOCUS_CITY_KEYS.has(normalizeCityKey(city))) {
    return {
      blocked: false,
      summary: '',
      issues: [],
    };
  }

  const issues = [];
  const duplicateNarrativeLines = collectNarrativeDuplicates(narrative);
  if (duplicateNarrativeLines.length) {
    issues.push({
      code: 'duplicate_narrative_sentences',
      severity: 'high',
      message: `duplicate narrative lines detected (${duplicateNarrativeLines.length})`,
    });
  }

  const staleSurgeCount = countStaleSurgeAlerts(alerts);
  if (staleSurgeCount > 0) {
    issues.push({
      code: 'stale_surge_alerts',
      severity: 'high',
      message: `${staleSurgeCount} stale surge alert(s) older than ${OUTPUT_GUARD_STALE_SURGE_DAYS} days`,
    });
  }

  for (const gap of collectCriticalOutputGaps({ suggestedPricing, marketPosition, marketContext, forwardCurve })) {
    issues.push({
      code: 'critical_output_gap',
      severity: 'high',
      message: gap,
    });
  }

  if (!issues.length) {
    return {
      blocked: false,
      summary: '',
      issues: [],
    };
  }

  return {
    blocked: true,
    summary: `Output integrity checks flagged: ${issues.map((issue) => issue.message).join('; ')}.`,
    issues,
  };
}

function mergeSignalQualityWithOutputGuard(signalQuality = null, outputGuard = null) {
  if (!outputGuard?.blocked) return signalQuality;

  const baseSignalQuality = signalQuality || {};
  if (baseSignalQuality.forceUnlocked) {
    return {
      ...baseSignalQuality,
      outputGuard,
    };
  }
  const mode = String(baseSignalQuality.mode || '').toLowerCase();
  if (mode === 'calibrating') {
    return {
      ...baseSignalQuality,
      summary: baseSignalQuality.summary
        ? `${baseSignalQuality.summary} ${outputGuard.summary}`
        : outputGuard.summary,
      outputGuard,
    };
  }

  return {
    ...baseSignalQuality,
    grade: 'Review',
    mode: 'verify',
    summary: `Verify before acting: ${outputGuard.summary.replace(/^Verify before acting:\s*/i, '')}`,
    outputGuard,
  };
}

function buildProductLock(city, signalQuality = null, outputGuard = null) {
  const cityKey = normalizeCityKey(city);
  const mode = String(signalQuality?.mode || '').toLowerCase();
  const forceUnlocked = Boolean(signalQuality?.forceUnlocked);
  const inFocusScope = PRODUCT_LOCK_FOCUS_CITY_KEYS.has(cityKey);
  const outputBlocked = Boolean(outputGuard?.blocked);
  const enabled = !forceUnlocked && inFocusScope && (mode !== 'actionable' || outputBlocked);

  return {
    enabled,
    scope: inFocusScope ? 'goa_mumbai' : 'default',
    mode: mode || 'unknown',
    reason: enabled
      ? outputBlocked
        ? outputGuard.summary
        : signalQuality?.summary || 'Signal quality is below trusted threshold. Pricing output is locked.'
      : forceUnlocked
        ? 'Permanent product unlock override is enabled via calibration settings.'
        : 'Signal quality is actionable.',
    unlockCriteria: inFocusScope
      ? forceUnlocked
        ? 'Disable global.dataHealth.forceProductUnlock to restore strict lock gates.'
        : 'Unlock requires actionable signal quality with fresh competitor, OTA, and event inputs, and clean output-integrity checks.'
      : 'No scope lock applied for this market.',
    checks: outputGuard?.issues || [],
  };
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
  let summary =
    direction === 'flat'
      ? `Demand score is unchanged at ${currentScore.toFixed(2)}.`
      : `Demand score moved ${direction} by ${Math.abs(scoreDelta).toFixed(2)} points since the last snapshot.`;
  if (direction !== 'flat' && Math.abs(positionDelta) < 0.01) {
    summary = `${summary} Market position is unchanged because hotel and market rates remained stable for the selected stay date.`;
  }

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

function clampShare(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, 0, 1);
}

function normalizeManualSignalOverrides(raw = null) {
  if (!raw || typeof raw !== 'object') return null;
  const pickScore = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return clamp(parsed, 0, 100);
  };
  const pickShare = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return clamp(parsed, 0, 1);
  };

  const competitorScore = pickScore(raw?.competitor?.score ?? raw?.competitorScore);
  const holidayScore = pickScore(raw?.holiday?.score ?? raw?.holidayScore);
  const airfareScore = pickScore(raw?.airfare?.score ?? raw?.airfareScore);
  const seasonScore = pickScore(raw?.season?.score ?? raw?.seasonScore);
  const eventShare = pickShare(raw?.holiday?.eventShare ?? raw?.eventShare);
  const weddingShare = pickShare(raw?.holiday?.weddingShare ?? raw?.weddingShare);
  const corporateShare = pickShare(raw?.holiday?.corporateShare ?? raw?.corporateShare);

  const normalized = {};
  if (competitorScore != null) normalized.competitor = { score: competitorScore };
  if (holidayScore != null || eventShare != null || weddingShare != null || corporateShare != null) {
    normalized.holiday = {};
    if (holidayScore != null) normalized.holiday.score = holidayScore;
    if (eventShare != null) normalized.holiday.eventShare = eventShare;
    if (weddingShare != null) normalized.holiday.weddingShare = weddingShare;
    if (corporateShare != null) normalized.holiday.corporateShare = corporateShare;
  }
  if (airfareScore != null) normalized.airfare = { score: airfareScore };
  if (seasonScore != null) normalized.season = { score: seasonScore };
  return Object.keys(normalized).length ? normalized : null;
}

function applyManualSignalOverrides(signals, manualOverrides = null) {
  const overrides = normalizeManualSignalOverrides(manualOverrides);
  if (!overrides) return signals;
  const nextSignals = {
    competitor: { ...(signals?.competitor || {}) },
    holiday: { ...(signals?.holiday || {}) },
    airfare: { ...(signals?.airfare || {}) },
    season: { ...(signals?.season || {}) },
  };

  if (overrides.competitor?.score != null) {
    nextSignals.competitor.score = overrides.competitor.score;
    nextSignals.competitor.neutral = false;
  }
  if (overrides.airfare?.score != null) {
    nextSignals.airfare.score = overrides.airfare.score;
    nextSignals.airfare.neutral = false;
  }
  if (overrides.season?.score != null) {
    nextSignals.season.score = overrides.season.score;
    nextSignals.season.neutral = false;
  }
  if (overrides.holiday) {
    if (overrides.holiday.score != null) {
      nextSignals.holiday.score = overrides.holiday.score;
      nextSignals.holiday.neutral = false;
    }
    const eventShare =
      overrides.holiday.eventShare != null
        ? clampShare(overrides.holiday.eventShare, 0)
        : clampShare(nextSignals.holiday.eventShare, 0);
    nextSignals.holiday.eventShare = eventShare;

    const weddingShareRaw =
      overrides.holiday.weddingShare != null
        ? clampShare(overrides.holiday.weddingShare, 0)
        : clampShare(nextSignals.holiday.weddingShare, 0);
    const corporateShareRaw =
      overrides.holiday.corporateShare != null
        ? clampShare(overrides.holiday.corporateShare, 0)
        : clampShare(nextSignals.holiday.corporateShare, 0);
    const totalShare = weddingShareRaw + corporateShareRaw;
    const scale = totalShare > 1 ? 1 / totalShare : 1;
    const weddingShare = clampShare(weddingShareRaw * scale, 0);
    const corporateShare = clampShare(corporateShareRaw * scale, 0);
    const otherShare = clampShare(1 - weddingShare - corporateShare, 0);
    nextSignals.holiday.weddingShare = weddingShare;
    nextSignals.holiday.corporateShare = corporateShare;
    nextSignals.holiday.eventCategoryShare = {
      ...(nextSignals.holiday.eventCategoryShare || {}),
      wedding_season: weddingShare,
      conference: corporateShare,
      general: otherShare,
    };
    nextSignals.holiday.manualOverride = true;
  }

  return nextSignals;
}

function buildSignals({ hotel, record, competitorRates, airfareSeries, holidays, events }, options = {}) {
  const forceRecompute = Boolean(options?.forceRecompute);
  const manualOverrides = normalizeManualSignalOverrides(options?.manualSignalOverrides || null);
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

  const computedSignals = {
    competitor:
      !forceRecompute && record.signals?.competitor
        ? record.signals.competitor
        : computeCompetitorScore(competitorRates),
    holiday:
      !forceRecompute && record.signals?.holiday
        ? record.signals.holiday
        : computeHolidayScore({ city: hotel.city, holidays, events }),
    airfare:
      !forceRecompute && record.signals?.airfare
        ? record.signals.airfare
        : computeAirfareScore({ city: hotel.city, series: airfareSeries }),
    season:
      !forceRecompute && record.signals?.season
        ? record.signals.season
        : computeSeasonScore({
            city: hotel.city,
            seasonProfileMonthly,
          }),
  };
  return applyManualSignalOverrides(computedSignals, manualOverrides);
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
  const rawSignalQuality = dataHealth?.signalQuality || null;
  const outputGuard = buildOutputGuard({
    city: hotel?.city,
    alerts,
    narrative,
    suggestedPricing: normalizedSuggestedPricing,
    marketPosition: normalizedMarketPosition,
    marketContext,
    forwardCurve,
  });
  const signalQuality = mergeSignalQualityWithOutputGuard(rawSignalQuality, outputGuard);
  const productLock = buildProductLock(hotel?.city, signalQuality, outputGuard);
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
    actionSummary: buildActionSummary(record, record.market_position, signalQuality),
    changeSummary: buildChangeSummary(record, previousRecord),
    competitiveGrid,
    otaParity: otaParity || null,
    dataHealth: dataHealth || null,
    signalQuality,
    productLock,
    outputGuard,
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

function normalizeCheckinDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

async function loadMarketScope(hotel, deps = defaultDeps, options = {}) {
  const requestedCheckinDate = normalizeCheckinDate(options?.checkinDate || options?.checkin_date || null);
  const latestMarketCheckin = requestedCheckinDate
    ? null
    : deps.getLatestMarketCheckinDate
      ? await deps.getLatestMarketCheckinDate(hotel.id)
      : null;
  const checkinDate = requestedCheckinDate || latestMarketCheckin?.checkin_date || null;

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
  const hotelRows = requestedCheckinDate
    ? (hotelPriceRaw && Number(hotelPriceRaw) > 0 ? 1 : 0)
    : Number(latestMarketCheckin?.hotel_rows || 0);

  return {
    checkinDate,
    observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    hotelRows,
    competitorRows: segmented.hotelCompetitorRates.length,
    otaRows: segmented.otaParityRates.length,
    allRates,
    hotelCompetitorRates: segmented.hotelCompetitorRates,
    otaParityRates: segmented.otaParityRates,
    hotelPriceRaw,
    lastScrapedAt,
  };
}

export async function getCompetitiveGrid(hotelId, deps = defaultDeps, preloadedScope = null, options = {}) {
  const hotel = await deps.getHotelById(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const marketScope =
    preloadedScope ||
    (await loadMarketScope(hotel, deps, {
      checkinDate: options?.checkinDate || options?.checkin_date || null,
    }));
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
  forceRecomputeSignals = false,
  manualSignalOverrides = null,
}) {
  const signals = buildSignals(
    { hotel, record, competitorRates, airfareSeries, holidays, events },
    {
      forceRecompute: forceRecomputeSignals,
      manualSignalOverrides,
    },
  );
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
  const requestedCheckinDate = normalizeCheckinDate(context?.checkin_date || context?.checkinDate || null);
  const manualSignalOverrides = normalizeManualSignalOverrides(context?.manual_signal_overrides || null);
  const marketScope =
    preloaded.marketScope ||
    (await loadMarketScope(hotel, deps, {
      checkinDate: requestedCheckinDate,
    }));
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
    forceRecomputeSignals: Boolean(requestedCheckinDate),
    manualSignalOverrides,
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
  const lastEventSync = deriveLastEventSync(events);
  const pipelineDiagnostics = deps.getSignalDiagnostics
    ? await deps.getSignalDiagnostics(
        hotel,
        {
          events,
          lastScrapedAt: marketScope.lastScrapedAt,
          lastEventSync,
        },
      )
    : null;

  const dataHealth = await computeDataHealthSnapshot(
    {
      hotelId: hotel.id,
      city: hotel.city,
      viewerRole: context.user_role || 'hotel_user',
      calibration,
      competitorRates,
      otaParityRates,
      airfareSeries,
      events,
      lastScrapedAt: marketScope.lastScrapedAt,
      lastEventSync,
      otaParity,
      confidence: derived.confidence,
      marketStability: derived.marketStability,
      performanceSummary,
      pipelineDiagnostics,
    },
    {
      upsertDataHealthIssue: deps.upsertDataHealthIssue,
      resolveInactiveDataHealthIssues: deps.resolveInactiveDataHealthIssues,
      listDataHealthIssues: deps.listDataHealthIssues,
    },
  );
  const marketContext = {
    ...marketScope,
    lastEventSync,
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

  const requestedCheckinDate = normalizeCheckinDate(context?.checkin_date || context?.checkinDate || null);
  const manualSignalOverrides = normalizeManualSignalOverrides(context?.manual_signal_overrides || null);
  const marketScope = await loadMarketScope(hotel, deps, {
    checkinDate: requestedCheckinDate,
  });
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

  const computedSignals = {
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
  const signals = applyManualSignalOverrides(computedSignals, manualSignalOverrides);

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

  const latestSuggestedBase = toFiniteNumber(
    latest.recommendation?.base ?? latest.recommendation?.basePrice,
    0,
  );
  const latestHotelPrice = toFiniteNumber(
    latest.market_position?.hotelPrice ?? latest.market_position?.hotel_price,
    0,
  );
  const latestAgeMs = latest?.created_at ? Date.now() - new Date(latest.created_at).getTime() : 0;
  const recordIsOldEnough = Number.isFinite(latestAgeMs) && latestAgeMs > 30 * 60 * 1000;
  if (recordIsOldEnough && latestSuggestedBase <= 0 && latestHotelPrice <= 0) {
    return recalculateDashboard(
      hotelId,
      { ...context, triggered_by: 'dashboard', source: 'revenue-impact-sync' },
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

export async function getOtaParity(hotelId, deps = defaultDeps, options = {}) {
  const hotel = await deps.getHotelById(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const [marketScope, calibration] = await Promise.all([
    loadMarketScope(hotel, deps, {
      checkinDate: options?.checkinDate || options?.checkin_date || null,
    }),
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
