import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  getCompetitorByHotelAndName,
  getLatestCompetitorPrice,
  insertCompetitor,
  insertCompetitorRateSnapshot,
  insertHotelRateSnapshot,
  listActiveHotelsForIngestion,
} from '../../repositories/ingestionRepository.js';
import { normalizeCompetitorRates } from '../intelligence-engine/rateNormalizationEngine.js';

const defaultDeps = {
  listActiveHotelsForIngestion,
  getCompetitorByHotelAndName,
  insertCompetitor,
  getLatestCompetitorPrice,
  insertCompetitorRateSnapshot,
  insertHotelRateSnapshot,
  readFile: fs.readFile,
};

const DEFAULT_SNAPSHOT_PATHS = [
  '/opt/radar_light/shared/ota_snapshots/latest.json',
  '/opt/radar_light/shared/ota_rates.json',
];

function todayPlus(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

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

  for (const suffix of [' hotel', ' resort', ' palace', ' haveli']) {
    if (normalized.endsWith(suffix)) {
      aliases.add(normalized.slice(0, -suffix.length).trim());
    }
  }

  return aliases;
}

function normalizeCompSet(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function toRateList(row = {}) {
  if (Array.isArray(row.list_of_rates) && row.list_of_rates.length) return row.list_of_rates;
  if (Array.isArray(row.rates) && row.rates.length) return row.rates;

  const raw = Number(row.rate ?? row.price ?? row.amount ?? row.value ?? row.normalized_rate);
  if (!Number.isFinite(raw) || raw <= 0) return [];

  return [
    {
      rate: raw,
      tax_included: Boolean(row.tax_included ?? row.includes_tax ?? false),
      tax_percent: Number.isFinite(Number(row.tax_percent)) ? Number(row.tax_percent) : undefined,
      tax_amount: Number.isFinite(Number(row.tax_amount)) ? Number(row.tax_amount) : undefined,
      cancellation_type: row.cancellation_type || '',
      rate_type: row.rate_type || 'BAR',
      source: row.source || 'snapshot',
    },
  ];
}

function toCheckinDate(rawDate) {
  const asText = String(rawDate || '').trim();
  if (!asText) return todayPlus(15);
  const date = new Date(asText);
  if (Number.isNaN(date.getTime())) return todayPlus(15);
  return date.toISOString().slice(0, 10);
}

function buildHotelIndex(hotels = []) {
  const byId = new Map();
  const byName = new Map();
  const byCity = new Map();
  for (const hotel of hotels) {
    byId.set(String(hotel.id), hotel);
    for (const alias of buildNameAliases(hotel.hotel_name, hotel.city)) {
      byName.set(alias, hotel);
    }
    const cityKey = normalizeName(hotel.city);
    if (!byCity.has(cityKey)) byCity.set(cityKey, []);
    byCity.get(cityKey).push(hotel);
  }
  return { byId, byName, byCity };
}

function resolveHotel(row, index) {
  const hotelId = String(row.hotel_id || '').trim();
  if (hotelId && index.byId.has(hotelId)) return index.byId.get(hotelId);

  for (const alias of buildNameAliases(row.hotel_name, row.city)) {
    if (index.byName.has(alias)) return index.byName.get(alias);
  }

  const cityKey = normalizeName(row.city);
  if (cityKey && index.byCity.has(cityKey) && index.byCity.get(cityKey).length === 1) {
    return index.byCity.get(cityKey)[0];
  }

  return null;
}

function isHotelRateRow(row = {}) {
  if (row.is_hotel_rate === true) return true;
  if (String(row.kind || '').trim().toLowerCase() === 'hotel_rate') return true;
  return (
    !String(row.competitor_name || '').trim() &&
    Number.isFinite(Number(row.hotel_rate ?? row.rate ?? row.price ?? row.amount))
  );
}

function chooseSnapshotPath(overridePath, cwd = process.cwd()) {
  if (overridePath) return overridePath;
  if (env.otaSnapshotFile && String(env.otaSnapshotFile).trim()) return env.otaSnapshotFile;

  const relativeCandidate = path.resolve(cwd, 'tmp', 'ota_rates.latest.json');
  return [relativeCandidate, ...DEFAULT_SNAPSHOT_PATHS];
}

async function loadSnapshotRows(snapshotPathOrCandidates, deps) {
  const candidates = Array.isArray(snapshotPathOrCandidates)
    ? snapshotPathOrCandidates
    : [snapshotPathOrCandidates];

  for (const candidate of candidates) {
    try {
      const payload = await deps.readFile(candidate, 'utf8');
      const parsed = JSON.parse(payload);
      const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
      if (!Array.isArray(rows)) {
        const error = new Error('Snapshot JSON must be an array or { rows: [] }.');
        error.status = 400;
        throw error;
      }
      return { rows, path: candidate };
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }

  return { rows: [], path: null };
}

async function ensureCompetitorForHotel(hotel, competitorName, websiteUrl, deps) {
  for (const alias of buildNameAliases(competitorName, hotel.city)) {
    const existing = await deps.getCompetitorByHotelAndName(hotel.id, alias);
    if (existing) return existing;
  }
  return deps.insertCompetitor({
    hotelId: hotel.id,
    competitorName,
    websiteUrl: websiteUrl || null,
  });
}

function buildCompetitorRowForNormalization(rawRow) {
  return {
    hotel_name: String(rawRow.competitor_name || '').trim(),
    date: toCheckinDate(rawRow.date || rawRow.checkin_date),
    room_category: String(rawRow.room_category || rawRow.room_type || 'Base Room'),
    list_of_rates: toRateList(rawRow),
    cancellation_type: String(rawRow.cancellation_type || '').trim(),
    source: String(rawRow.source || 'snapshot').trim(),
  };
}

async function processHotelRateRow(rawRow, hotel, nowIso, deps) {
  const price = Number(rawRow.hotel_rate ?? rawRow.rate ?? rawRow.price ?? rawRow.amount);
  if (!Number.isFinite(price) || price <= 0) return false;

  await deps.insertHotelRateSnapshot({
    hotelId: hotel.id,
    checkinDate: toCheckinDate(rawRow.date || rawRow.checkin_date),
    price,
    capturedAt: nowIso,
  });
  return true;
}

/**
 * Run one OTA snapshot ingestion cycle.
 * Snapshot row format (array):
 * - hotel_id or hotel_name
 * - competitor_name (omit + set is_hotel_rate=true for own-hotel rate rows)
 * - date/checkin_date
 * - list_of_rates OR rates OR rate/price
 * - room_category, cancellation_type, source, website_url (optional)
 */
export async function runOtaIngestionCycle(options = {}, deps = defaultDeps) {
  const cycleStarted = Date.now();
  const nowIso = new Date().toISOString();
  const summary = {
    startedAt: nowIso,
    snapshotPath: null,
    rowsRead: 0,
    competitorRowsIngested: 0,
    hotelRateRowsIngested: 0,
    skippedRows: 0,
    skippedUnknownHotel: 0,
    skippedInvalidRate: 0,
    skippedMissingCompetitorName: 0,
    missingSnapshot: false,
    durationMs: 0,
  };

  const hotels = await deps.listActiveHotelsForIngestion();
  const hotelIndex = buildHotelIndex(hotels);

  // Bootstrap competitor master rows from comp_set_json for active hotels.
  for (const hotel of hotels) {
    const compSet = normalizeCompSet(hotel.comp_set_json);
    for (const name of compSet) {
      await ensureCompetitorForHotel(hotel, name, null, deps);
    }
  }

  const snapshotPathCandidate = chooseSnapshotPath(options.snapshotPath);
  const snapshot = await loadSnapshotRows(snapshotPathCandidate, deps);
  summary.snapshotPath = snapshot.path;
  summary.rowsRead = snapshot.rows.length;

  if (!snapshot.rows.length) {
    summary.missingSnapshot = true;
    summary.durationMs = Date.now() - cycleStarted;
    logger.warn('ota_ingestion_skipped_no_snapshot', summary);
    return summary;
  }

  for (const rawRow of snapshot.rows) {
    const hotel = resolveHotel(rawRow, hotelIndex);
    if (!hotel) {
      summary.skippedRows += 1;
      summary.skippedUnknownHotel += 1;
      continue;
    }

    if (isHotelRateRow(rawRow)) {
      const ingested = await processHotelRateRow(rawRow, hotel, nowIso, deps);
      if (ingested) {
        summary.hotelRateRowsIngested += 1;
      } else {
        summary.skippedRows += 1;
        summary.skippedInvalidRate += 1;
      }
      continue;
    }

    const competitorName = String(rawRow.competitor_name || '').trim();
    if (!competitorName) {
      summary.skippedRows += 1;
      summary.skippedMissingCompetitorName += 1;
      continue;
    }

    const normalizedInput = buildCompetitorRowForNormalization({
      ...rawRow,
      competitor_name: competitorName,
    });
    const normalized = normalizeCompetitorRates([normalizedInput]);
    const normalizedRate = Number(normalized[0]?.normalized_rate || 0);
    if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) {
      summary.skippedRows += 1;
      summary.skippedInvalidRate += 1;
      continue;
    }

    const competitor = await ensureCompetitorForHotel(
      hotel,
      competitorName,
      rawRow.website_url || rawRow.url || null,
      deps,
    );

    const checkinDate = normalized[0]?.date || toCheckinDate(rawRow.date || rawRow.checkin_date);
    const previousPrice = await deps.getLatestCompetitorPrice({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate,
    });
    const price48hAgo = Number.isFinite(previousPrice) && previousPrice > 0 ? previousPrice : normalizedRate;

    await deps.insertCompetitorRateSnapshot({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate,
      priceToday: normalizedRate,
      price48hAgo,
      scrapedAt: nowIso,
    });

    summary.competitorRowsIngested += 1;
  }

  summary.durationMs = Date.now() - cycleStarted;
  logger.info('ota_ingestion_completed', summary);
  return summary;
}
