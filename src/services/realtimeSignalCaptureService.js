import fs from 'fs/promises';
import { setTimeout as sleep } from 'timers/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  getCompetitorByHotelAndName,
  getLatestCompetitorPrice,
  insertCompetitor,
  insertCompetitorRateSnapshot,
  insertHotelRateSnapshot,
  listActiveHotelsForIngestion,
} from '../repositories/ingestionRepository.js';
import {
  createRealtimeSignalRun,
  finishRealtimeSignalRun,
  insertRealtimeSignalObservation,
  listLatestRateEvidence,
} from '../repositories/realtimeSignalRepository.js';
import {
  listEnabledVerifiedLiveDataSources,
  updateVerifiedLiveDataSourceHealth,
} from '../repositories/verifiedLiveDataSourceRepository.js';
import { listUpcomingEventsByCity } from '../repositories/eventRepository.js';
import { enqueueRecalculationJob } from './recalcQueueService.js';
import { normalizeCompetitorRates } from './intelligence-engine/rateNormalizationEngine.js';
import { getLeadRadarExternalSignals } from './googleSignalIntelService.js';
import { collectVerifiedLiveDataSourceRows } from './verifiedLiveDataSourceAdapterService.js';
import {
  normalizeVerifiedLiveObservation,
  summarizeConnectorVerification,
} from './verifiedLiveDataConnectorService.js';

const execFileAsync = promisify(execFile);
const DEFAULT_SNAPSHOT_PATHS = [
  '/opt/radar_light/shared/realtime_signals/latest.json',
  '/opt/radar_light/shared/ota_snapshots/latest.json',
  '/opt/radar_light/shared/ota_rates.json',
  'tmp/realtime_signals.latest.json',
  'tmp/ota_rates.latest.json',
];

const OTA_PATTERN = /(booking|agoda|makemytrip|\bmmt\b|goibibo|expedia|trip\.?com|tripadvisor|google hotels)/i;
const RATE_SIGNAL_TYPES = new Set(['hotel_rate', 'ota_rate', 'competitor_rate']);

const defaultDeps = {
  listActiveHotelsForIngestion,
  getCompetitorByHotelAndName,
  insertCompetitor,
  getLatestCompetitorPrice,
  insertCompetitorRateSnapshot,
  insertHotelRateSnapshot,
  createRealtimeSignalRun,
  finishRealtimeSignalRun,
  insertRealtimeSignalObservation,
  listLatestRateEvidence,
  listEnabledVerifiedLiveDataSources,
  updateVerifiedLiveDataSourceHealth,
  collectVerifiedLiveDataSourceRows,
  listUpcomingEventsByCity,
  enqueueRecalculationJob,
  getLeadRadarExternalSignals,
  readFile: fs.readFile,
  execFile: execFileAsync,
};

function normalizeName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function buildNameAliases(value = '', city = '') {
  const aliases = new Set();
  const normalized = normalizeName(value);
  if (!normalized) return aliases;
  aliases.add(normalized);

  const cityToken = normalizeName(city);
  if (cityToken && normalized.endsWith(` ${cityToken}`)) {
    aliases.add(normalized.slice(0, -(` ${cityToken}`).length).trim());
  } else if (cityToken) {
    aliases.add(`${normalized} ${cityToken}`.trim());
  }

  for (const suffix of [' hotel', ' resort', ' villa', ' goa']) {
    if (normalized.endsWith(suffix)) aliases.add(normalized.slice(0, -suffix.length).trim());
  }
  return aliases;
}

function buildHotelIndex(hotels = []) {
  const byId = new Map();
  const byName = new Map();
  const byCity = new Map();
  for (const hotel of hotels) {
    byId.set(String(hotel.id), hotel);
    for (const alias of buildNameAliases(hotel.hotel_name, hotel.city)) byName.set(alias, hotel);
    const cityKey = normalizeName(hotel.city);
    if (!byCity.has(cityKey)) byCity.set(cityKey, []);
    byCity.get(cityKey).push(hotel);
  }
  return { byId, byName, byCity };
}

function resolveHotel(row, index) {
  const hotelId = String(row.hotel_id || '').trim();
  if (hotelId && index.byId.has(hotelId)) return index.byId.get(hotelId);

  for (const alias of buildNameAliases(row.hotel_name || row.property_name, row.city)) {
    if (index.byName.has(alias)) return index.byName.get(alias);
  }

  const cityKey = normalizeName(row.city);
  if (cityKey && index.byCity.has(cityKey) && index.byCity.get(cityKey).length === 1) {
    return index.byCity.get(cityKey)[0];
  }
  return null;
}

function toCheckinDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = raw ? new Date(raw) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function toFinitePrice(row = {}) {
  const value = Number(row.hotel_rate ?? row.rate ?? row.price ?? row.amount ?? row.value ?? row.normalized_rate);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isHotelRateRow(row = {}) {
  const kind = String(row.kind || row.signal_type || row.type || '').trim().toLowerCase();
  const sourceType = String(row.source_type || row.sourceType || '').trim().toLowerCase();
  if (sourceType === 'official') return true;
  if (row.is_hotel_rate === true) return true;
  if (kind === 'hotel_rate' || kind === 'official_rate') return true;
  return !sourceType && !String(row.competitor_name || '').trim() && toFinitePrice(row) > 0;
}

function toRateList(row = {}) {
  if (Array.isArray(row.list_of_rates) && row.list_of_rates.length) return row.list_of_rates;
  if (Array.isArray(row.rates) && row.rates.length) return row.rates;
  const rate = toFinitePrice(row);
  return rate > 0 ? [{ rate, source: row.source || row.source_name || 'realtime-capture' }] : [];
}

function buildNormalizedRateInput(row = {}, competitorName) {
  return {
    hotel_name: competitorName,
    date: toCheckinDate(row.checkin_date || row.date || row.stay_date),
    room_category: String(row.room_category || row.room_type || 'Base Room'),
    list_of_rates: toRateList(row),
    cancellation_type: String(row.cancellation_type || row.cancellation_policy || '').trim(),
    source: String(row.source || row.source_name || 'realtime-capture').trim(),
  };
}

function sourceTypeForName(name = '', url = '') {
  return OTA_PATTERN.test(`${name} ${url}`) ? 'ota' : 'competitor';
}

function freshnessExpiry(nowIso, sourceType) {
  const ms = sourceType === 'competitor' ? 2 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(new Date(nowIso).getTime() + ms).toISOString();
}

function eventFreshnessExpiry(event, nowIso) {
  const endDate = toCheckinDate(event?.end_date || event?.endDate || event?.start_date || event?.startDate);
  const end = new Date(`${endDate}T23:59:59.000Z`).getTime();
  const fallback = new Date(new Date(nowIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
  if (!Number.isFinite(end)) return fallback;
  return new Date(Math.max(end, new Date(fallback).getTime())).toISOString();
}

function classifyEventSignal(event = {}) {
  const category = normalizeName(event.category || '');
  const eventName = normalizeName(event.event_name || event.eventName || '');
  const combined = `${category} ${eventName}`.trim();
  if (/(wedding|marriage|bridal|banquet)/.test(combined)) return 'wedding';
  if (/(mice|corporate|business|summit|conference|expo|exhibition|trade show|convention)/.test(combined)) return 'mice';
  if (/(festival|carnival|holiday|cultural)/.test(combined)) return 'festival';
  if (/(airport|aviation|arrival|flight)/.test(combined)) return 'airport';
  if (/(tourism|leisure|seasonal|travel)/.test(combined)) return 'tourism';
  return 'event';
}

function eventConfidenceScore(event = {}) {
  const confidence = normalizeName(event.confidence || '');
  if (confidence.includes('confirmed')) return 86;
  if (confidence.includes('high')) return 82;
  if (confidence.includes('medium')) return 74;
  if (confidence.includes('low')) return 58;
  return 68;
}

async function loadSnapshotRows(options, deps) {
  const candidates = [options.snapshotPath, env.realtimeSignalSnapshotFile, ...DEFAULT_SNAPSHOT_PATHS]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      const payload = await deps.readFile(candidate, 'utf8');
      const parsed = JSON.parse(payload);
      const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
      if (!Array.isArray(rows)) throw new Error('Realtime signal snapshot must be an array or { rows: [] }.');
      return { rows, path: candidate };
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return { rows: [], path: null };
}

async function maybeRunCollector(options, deps) {
  const command = String(options.collectorCommand || env.realtimeSignalCollectorCommand || '').trim();
  if (!command) return { ran: false };
  const [binary, ...args] = command.split(/\s+/).filter(Boolean);
  if (!binary) return { ran: false };
  const result = await deps.execFile(binary, args, {
    timeout: Number(env.realtimeSignalCollectorTimeoutMs || 120000),
    maxBuffer: 1024 * 1024,
  });
  return { ran: true, stdout: result.stdout || '', stderr: result.stderr || '' };
}

async function ensureCompetitorForHotel(hotel, competitorName, websiteUrl, deps) {
  for (const alias of buildNameAliases(competitorName, hotel.city)) {
    const existing = await deps.getCompetitorByHotelAndName(hotel.id, alias);
    if (existing) return existing;
  }
  return deps.insertCompetitor({ hotelId: hotel.id, competitorName, websiteUrl: websiteUrl || null });
}

async function recordObservation(observation, deps) {
  const verification = normalizeVerifiedLiveObservation(observation, {
    runId: observation.runId,
    hotelId: observation.hotelId,
    city: observation.city,
    nowIso: observation.nowIso,
    connectorName: observation.connectorName || 'realtime-signal-capture',
  });

  if (!verification.accepted) return verification;

  await deps.insertRealtimeSignalObservation(verification.observation);
  return {
    ...verification,
    hotelId: verification.observation.hotelId,
    checkinDate: verification.observation.checkinDate,
  };
}

async function processSnapshotRow({ row, hotel, runId, nowIso, deps }) {
  const checkinDate = toCheckinDate(row.checkin_date || row.date || row.stay_date);
  const proofUrl = String(row.proof_url || row.url || row.website_url || '').trim();
  const observedAt = row.observed_at || row.captured_at || nowIso;
  const sourceTypeHint = String(row.source_type || row.sourceType || '').trim().toLowerCase();
  const signalTypeHint = String(row.signal_type || row.signalType || '').trim().toLowerCase();
  const isKnownNonRateSignal =
    signalTypeHint && !RATE_SIGNAL_TYPES.has(signalTypeHint) && sourceTypeHint !== 'official';

  if (isKnownNonRateSignal) {
    const recorded = await recordObservation({
      runId,
      hotelId: hotel.id,
      city: hotel.city,
      checkinDate,
      sourceType: sourceTypeHint,
      sourceName: String(row.source_name || row.sourceName || row.channel || row.provider || 'Live data source').trim(),
      signalType: signalTypeHint,
      valueNumeric: row.value_numeric ?? row.valueNumeric ?? row.price ?? row.rate ?? row.amount ?? null,
      valueText: String(row.value_text || row.valueText || row.description || row.note || '').trim(),
      proofUrl,
      confidenceScore: Number(row.confidence_score || row.confidenceScore || 70),
      observedAt,
      freshnessExpiresAt: row.freshness_expires_at || row.freshnessExpiresAt || freshnessExpiry(nowIso, sourceTypeHint),
      nowIso,
      connectorName: row.connector_name || row.connectorName || row.source_adapter || row.source || 'configured-live-data-source',
      metadata: { ...(row.metadata || {}), directConnectorSignal: true },
    }, deps);
    if (!recorded.accepted) return { skipped: true, reason: recorded.reason, verification: recorded };
    return {
      signalRows: 1,
      affected: { hotelId: hotel.id, checkinDate },
      verification: recorded,
    };
  }

  if (isHotelRateRow(row)) {
    const price = toFinitePrice(row);
    if (!price) return { skipped: true, reason: 'invalid_hotel_rate' };
    await deps.insertHotelRateSnapshot({ hotelId: hotel.id, checkinDate, price, capturedAt: observedAt });
    const recorded = await recordObservation({
      runId,
      hotelId: hotel.id,
      city: hotel.city,
      checkinDate,
      sourceType: 'official',
      sourceName: String(row.source_name || row.source || hotel.hotel_name || 'Official').trim(),
      signalType: 'hotel_rate',
      valueNumeric: price,
      proofUrl,
      confidenceScore: Number(row.confidence_score || 90),
      observedAt,
      freshnessExpiresAt: freshnessExpiry(nowIso, 'official'),
      nowIso,
      connectorName: row.connector_name || row.source_adapter || row.source || 'snapshot-official-rate',
      metadata: { roomType: row.room_type || row.room_category || null, mealPlan: row.meal_plan || null },
    }, deps);
    if (!recorded.accepted) return { skipped: true, reason: recorded.reason, verification: recorded };
    return { hotelRateRows: 1, affected: { hotelId: hotel.id, checkinDate }, verification: recorded };
  }

  const competitorName = String(row.competitor_name || row.channel || row.source_name || '').trim();
  if (!competitorName) return { skipped: true, reason: 'missing_competitor_name' };
  const normalized = normalizeCompetitorRates([buildNormalizedRateInput(row, competitorName)]);
  const price = Number(normalized[0]?.normalized_rate || 0);
  if (!Number.isFinite(price) || price <= 0) return { skipped: true, reason: 'invalid_competitor_rate' };

  const competitor = await ensureCompetitorForHotel(hotel, competitorName, proofUrl, deps);
  const previousPrice = await deps.getLatestCompetitorPrice({ hotelId: hotel.id, competitorId: competitor.id, checkinDate });
  await deps.insertCompetitorRateSnapshot({
    hotelId: hotel.id,
    competitorId: competitor.id,
    checkinDate,
    priceToday: price,
    price48hAgo: Number(previousPrice || price),
    scrapedAt: observedAt,
  });

  const sourceType = sourceTypeForName(competitorName, proofUrl);
  const recorded = await recordObservation({
    runId,
    hotelId: hotel.id,
    city: hotel.city,
    checkinDate,
    sourceType,
    sourceName: competitorName,
    signalType: sourceType === 'ota' ? 'ota_rate' : 'competitor_rate',
    valueNumeric: price,
    proofUrl,
    confidenceScore: Number(row.confidence_score || (sourceType === 'ota' ? 82 : 78)),
    observedAt,
    freshnessExpiresAt: freshnessExpiry(nowIso, sourceType),
    nowIso,
    connectorName: row.connector_name || row.source_adapter || row.source || 'snapshot-rate-evidence',
    metadata: { roomType: row.room_type || row.room_category || null, mealPlan: row.meal_plan || null },
  }, deps);
  if (!recorded.accepted) return { skipped: true, reason: recorded.reason, verification: recorded };
  return {
    competitorRows: sourceType === 'competitor' ? 1 : 0,
    otaRows: sourceType === 'ota' ? 1 : 0,
    affected: { hotelId: hotel.id, checkinDate },
    verification: recorded,
  };
}

async function mirrorExistingEvidence({ runId, nowIso, deps, hotelId = null }) {
  const evidenceRows = await deps.listLatestRateEvidence({ hotelId, limit: 200 });
  const affected = [];
  const verificationResults = [];
  for (const row of evidenceRows) {
    const recorded = await recordObservation({
      runId,
      hotelId: row.hotel_id,
      city: row.city,
      checkinDate: toCheckinDate(row.checkin_date),
      sourceType: row.source_type,
      sourceName: row.source_name,
      signalType: row.signal_type,
      valueNumeric: row.value_numeric == null ? null : Number(row.value_numeric),
      proofUrl: row.proof_url || '',
      confidenceScore: row.source_type === 'official' ? 88 : 76,
      observedAt: row.observed_at || nowIso,
      freshnessExpiresAt: freshnessExpiry(nowIso, row.source_type),
      nowIso,
      connectorName: 'latest-rate-evidence-mirror',
      metadata: { ...(row.metadata || {}), mirroredFromLatestEvidence: true },
    }, deps);
    verificationResults.push(recorded);
    if (recorded.accepted) {
      affected.push({ hotelId: row.hotel_id, checkinDate: toCheckinDate(row.checkin_date) });
    }
  }
  return { evidenceRows, affected, verificationResults };
}

async function mirrorUpcomingEventSignals({ runId, nowIso, deps, hotels = [], horizonDays = 45 }) {
  const hotelsByCity = new Map();
  for (const hotel of hotels) {
    const city = String(hotel.city || '').trim();
    if (!city) continue;
    if (!hotelsByCity.has(city)) hotelsByCity.set(city, []);
    hotelsByCity.get(city).push(hotel);
  }

  const affected = [];
  const verificationResults = [];
  let eventRows = 0;
  let weddingRows = 0;
  let miceRows = 0;

  for (const [city, cityHotels] of hotelsByCity.entries()) {
    const events = await deps.listUpcomingEventsByCity(city, { horizonDays });
    for (const event of events) {
      const eventType = classifyEventSignal(event);
      const checkinDate = toCheckinDate(event.start_date || event.startDate);
      const eventName = String(event.event_name || event.eventName || 'Market event').trim();
      const impactScore = Number.isFinite(Number(event.impact_score)) ? Number(event.impact_score) : 8;

      for (const hotel of cityHotels) {
        const recorded = await recordObservation({
          runId,
          hotelId: hotel.id,
          city,
          checkinDate,
          sourceType: 'event',
          sourceName: eventName,
          signalType: 'event_signal',
          valueNumeric: impactScore,
          valueText: eventName,
          proofUrl: event.event_url || '',
          confidenceScore: eventConfidenceScore(event),
          observedAt: event.scraped_at || nowIso,
          freshnessExpiresAt: eventFreshnessExpiry(event, nowIso),
          nowIso,
          connectorName: 'city-event-intelligence-mirror',
          metadata: {
            eventType,
            category: event.category || null,
            scale: event.scale || null,
            venue: event.venue || null,
            estimatedAttendance: event.estimated_attendance || null,
            source: event.source || null,
            mirroredFromCityEvents: true,
          },
        }, deps);
        verificationResults.push(recorded);
        if (recorded.accepted) {
          affected.push({ hotelId: hotel.id, checkinDate });
          eventRows += 1;
          if (eventType === 'wedding') weddingRows += 1;
          if (eventType === 'mice') miceRows += 1;
        }
      }
    }
  }

  return { eventRows, weddingRows, miceRows, affected, verificationResults };
}

async function mirrorGoogleTravelSignals({ runId, nowIso, deps, hotels = [] }) {
  if (!deps.getLeadRadarExternalSignals) {
    return { googleTrendRows: 0, affected: [], verificationResults: [] };
  }

  const hotelsByCity = new Map();
  for (const hotel of hotels) {
    const city = String(hotel.city || '').trim();
    if (!city) continue;
    if (!hotelsByCity.has(city)) hotelsByCity.set(city, []);
    hotelsByCity.get(city).push(hotel);
  }

  const affected = [];
  const verificationResults = [];
  let googleTrendRows = 0;
  const checkinDate = toCheckinDate(nowIso);

  for (const [city, cityHotels] of hotelsByCity.entries()) {
    let payload = null;
    try {
      payload = await deps.getLeadRadarExternalSignals({ city });
    } catch (error) {
      logger.warn('realtime_google_travel_signal_failed', {
        city,
        error: error?.message || String(error),
      });
      continue;
    }

    const signals = Array.isArray(payload?.signals) ? payload.signals : [];
    const liveSignals = signals
      .filter((signal) => /google_trends/i.test(String(signal?.source || '')))
      .slice(0, 8);

    for (const signal of liveSignals) {
      const impactScore = Number.isFinite(Number(signal.impactScore)) ? Number(signal.impactScore) : null;
      for (const hotel of cityHotels) {
        const recorded = await recordObservation({
          runId,
          hotelId: hotel.id,
          city,
          checkinDate,
          sourceType: 'search',
          sourceName: String(signal.title || signal.id || 'Google Trends travel pressure').trim(),
          signalType: 'search_trend',
          valueNumeric: impactScore,
          valueText: String(signal.description || '').trim(),
          proofUrl: '',
          confidenceScore: Number(signal.confidenceScore || 66),
          observedAt: signal.createdAt || nowIso,
          freshnessExpiresAt: new Date(new Date(nowIso).getTime() + 12 * 60 * 60 * 1000).toISOString(),
          nowIso,
          connectorName: 'google-trends-travel-signal',
          metadata: {
            source: signal.source || 'google_trends_live',
            signalType: signal.signalType || '',
            provider: 'google_trends',
            recommendedAction: signal.recommendedAction || '',
            details: Array.isArray(signal.details) ? signal.details.slice(-7) : [],
          },
        }, deps);
        verificationResults.push(recorded);
        if (recorded.accepted) {
          googleTrendRows += 1;
          affected.push({ hotelId: hotel.id, checkinDate });
        }
      }
    }
  }

  return { googleTrendRows, affected, verificationResults };
}

function uniqueAffectedDates(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.hotelId || !entry?.checkinDate) continue;
    map.set(`${entry.hotelId}:${entry.checkinDate}`, entry);
  }
  return [...map.values()];
}

export async function runRealtimeSignalCaptureCycle(options = {}, deps = defaultDeps) {
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const run = await deps.createRealtimeSignalRun({
    source: options.source || 'realtime-capture',
    cadence: options.cadence || 'manual',
  });
  const summary = {
    runId: run?.id || null,
    startedAt: nowIso,
    snapshotPath: null,
    snapshotRows: 0,
    hotelRateRows: 0,
    otaRows: 0,
    competitorRows: 0,
    eventRows: 0,
    weddingRows: 0,
    miceRows: 0,
    googleTrendRows: 0,
    directSignalRows: 0,
    mirroredEvidenceRows: 0,
    configuredSourceRows: 0,
    configuredSourcesChecked: 0,
    configuredSourcesOk: 0,
    configuredSourcesFailed: 0,
    skippedRows: 0,
    verifiedRows: 0,
    needsProofRows: 0,
    rejectedObservationRows: 0,
    sourceTypeRows: {},
    verificationRejectionReasons: {},
    recalcJobsQueued: 0,
    collectorRan: false,
    missingSnapshot: false,
    durationMs: 0,
  };

  const verificationResults = [];

  try {
    const collector = await maybeRunCollector(options, deps);
    summary.collectorRan = Boolean(collector.ran);

    const hotels = await deps.listActiveHotelsForIngestion();
    const hotelIndex = buildHotelIndex(hotels);
    const snapshot = await loadSnapshotRows(options, deps);
    summary.snapshotPath = snapshot.path;
    summary.snapshotRows = snapshot.rows.length;
    summary.missingSnapshot = !snapshot.rows.length;

    const affected = [];
    const configuredSources = await deps.listEnabledVerifiedLiveDataSources?.({
      hotelId: options.hotelId || null,
      force: Boolean(options.forceConfiguredSources),
    }) || [];
    const configuredRows = await deps.collectVerifiedLiveDataSourceRows?.({
      sources: configuredSources,
      nowIso,
    });
    const sourceResults = Array.isArray(configuredRows?.sourceResults) ? configuredRows.sourceResults : [];
    summary.configuredSourcesChecked = sourceResults.length;
    summary.configuredSourcesOk = sourceResults.filter((row) => row.status === 'ok').length;
    summary.configuredSourcesFailed = sourceResults.filter((row) => row.status === 'failed').length;
    summary.configuredSourceRows = Array.isArray(configuredRows?.rows) ? configuredRows.rows.length : 0;

    for (const result of sourceResults) {
      if (!result.sourceId || !deps.updateVerifiedLiveDataSourceHealth) continue;
      await deps.updateVerifiedLiveDataSourceHealth({
        sourceId: result.sourceId,
        status: result.status,
        errorMessage: result.error,
        metadata: { lastRows: result.rows, lastRunId: run.id },
      });
    }

    for (const row of [...snapshot.rows, ...(configuredRows?.rows || [])]) {
      const hotel = resolveHotel(row, hotelIndex);
      if (!hotel) {
        summary.skippedRows += 1;
        continue;
      }
      const result = await processSnapshotRow({ row, hotel, runId: run.id, nowIso, deps });
      if (result.skipped) {
        summary.skippedRows += 1;
        if (result.verification) verificationResults.push(result.verification);
        continue;
      }
      summary.hotelRateRows += Number(result.hotelRateRows || 0);
      summary.otaRows += Number(result.otaRows || 0);
      summary.competitorRows += Number(result.competitorRows || 0);
      summary.directSignalRows += Number(result.signalRows || 0);
      if (result.verification) verificationResults.push(result.verification);
      affected.push(result.affected);
    }

    const mirrored = await mirrorExistingEvidence({ runId: run.id, nowIso, deps, hotelId: options.hotelId || null });
    summary.mirroredEvidenceRows = mirrored.evidenceRows.length;
    verificationResults.push(...mirrored.verificationResults);
    affected.push(...mirrored.affected);

    const eventHotels = options.hotelId
      ? hotels.filter((hotel) => String(hotel.id) === String(options.hotelId))
      : hotels;
    const mirroredEvents = await mirrorUpcomingEventSignals({
      runId: run.id,
      nowIso,
      deps,
      hotels: eventHotels,
      horizonDays: Number(options.eventHorizonDays || env.realtimeSignalEventHorizonDays || 45),
    });
    summary.eventRows = mirroredEvents.eventRows;
    summary.weddingRows = mirroredEvents.weddingRows;
    summary.miceRows = mirroredEvents.miceRows;
    verificationResults.push(...mirroredEvents.verificationResults);
    affected.push(...mirroredEvents.affected);

    const mirroredGoogleTravel = await mirrorGoogleTravelSignals({
      runId: run.id,
      nowIso,
      deps,
      hotels: eventHotels,
    });
    summary.googleTrendRows = mirroredGoogleTravel.googleTrendRows;
    verificationResults.push(...mirroredGoogleTravel.verificationResults);
    affected.push(...mirroredGoogleTravel.affected);

    const verificationSummary = summarizeConnectorVerification(verificationResults);
    summary.verifiedRows = verificationSummary.verifiedRows;
    summary.needsProofRows = verificationSummary.needsProofRows;
    summary.rejectedObservationRows = verificationSummary.rejectedRows;
    summary.sourceTypeRows = verificationSummary.bySourceType;
    summary.verificationRejectionReasons = verificationSummary.rejectionReasons;

    for (const entry of uniqueAffectedDates(affected)) {
      await deps.enqueueRecalculationJob({
        hotelId: entry.hotelId,
        source: 'realtime-signal-capture',
        priority: 35,
        payload: {
          triggered_by: 'realtime-signal-capture',
          source: 'realtime-signal-capture',
          checkin_date: entry.checkinDate,
        },
      });
      summary.recalcJobsQueued += 1;
    }

    summary.durationMs = Date.now() - startedAt;
    const status = summary.missingSnapshot && summary.mirroredEvidenceRows > 0 ? 'partial' : 'completed';
    await deps.finishRealtimeSignalRun({ runId: run.id, status, summary });
    logger.info('realtime_signal_capture_completed', summary);
    return summary;
  } catch (error) {
    summary.durationMs = Date.now() - startedAt;
    await deps.finishRealtimeSignalRun({
      runId: run?.id,
      status: 'failed',
      summary,
      errorMessage: error.message,
    }).catch(() => {});
    logger.error('realtime_signal_capture_failed', { ...summary, error: error.message });
    throw error;
  }
}

export async function runRealtimeSignalCaptureLoop(options = {}, deps = defaultDeps) {
  const intervalMs = Math.max(60_000, Number(options.intervalMs || env.realtimeSignalCaptureIntervalMs || 30 * 60 * 1000));
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  logger.info('realtime_signal_capture_worker_started', { intervalMs });
  while (!stopped) {
    await runRealtimeSignalCaptureCycle({ ...options, cadence: 'interval' }, deps).catch(() => {});
    if (!stopped) await sleep(intervalMs);
  }
  logger.info('realtime_signal_capture_worker_stopped');
}
