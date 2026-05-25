import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';

const DEFAULT_OTA_SNAPSHOT_PATHS = [
  '/opt/radar_light/shared/ota_snapshots/latest.json',
  '/opt/radar_light/shared/ota_rates.json',
];

const DEFAULT_EVENT_SNAPSHOT_PATHS = [
  '/opt/radar_light/shared/event_snapshots/latest.json',
  '/opt/radar_light/shared/events/latest.json',
];

const OTA_CHANNEL_PATTERN =
  /(booking|agoda|makemytrip|\bmmt\b|goibibo|expedia|trip\.?com|tripadvisor)/i;

const defaultDeps = {
  readFile: fs.readFile,
};

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeName(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function buildAliases(value = '', city = '') {
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

  return aliases;
}

function canonicalCity(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (value.includes('gurugram') || value.includes('gurgaon')) return 'Gurugram';
  if (value.includes('delhi') || value.includes('new delhi') || value.includes('ncr')) return 'Delhi';
  if (value.includes('goa')) return 'Goa';
  if (value.includes('mumbai') || value.includes('bombay')) return 'Mumbai';
  if (value.includes('jaipur')) return 'Jaipur';
  return '';
}

function chooseOtaSnapshotCandidates(overridePath = '', cwd = process.cwd()) {
  if (normalizeText(overridePath)) return [overridePath];
  if (normalizeText(env.otaSnapshotFile)) return [env.otaSnapshotFile];
  return [path.resolve(cwd, 'tmp', 'ota_rates.latest.json'), ...DEFAULT_OTA_SNAPSHOT_PATHS];
}

function chooseEventSnapshotCandidates(overridePath = '', cwd = process.cwd()) {
  if (normalizeText(overridePath)) return [overridePath];
  if (normalizeText(env.eventSnapshotFile)) return [env.eventSnapshotFile];
  return [path.resolve(cwd, 'tmp', 'events.latest.json'), ...DEFAULT_EVENT_SNAPSHOT_PATHS];
}

async function loadSnapshotRows(candidates, deps) {
  for (const candidate of candidates) {
    try {
      const payload = await deps.readFile(candidate, 'utf8');
      const parsed = JSON.parse(payload);
      const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
      if (!Array.isArray(rows)) {
        return { path: candidate, rows: [], malformed: true };
      }
      return { path: candidate, rows, malformed: false };
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return { path: null, rows: [], malformed: false };
}

function inferOtaRowCity(row = {}, hotelAliases = new Set()) {
  const explicitCity = canonicalCity(row.city || row.market || row.destination);
  if (explicitCity) return explicitCity;

  for (const alias of buildAliases(row.hotel_name, '')) {
    if (hotelAliases.has(alias)) return null;
  }

  const combined = `${normalizeText(row.hotel_name)} ${normalizeText(row.competitor_name)}`.toLowerCase();
  return canonicalCity(combined);
}

function rowHasValidRate(row = {}) {
  const directRate = Number(row.hotel_rate ?? row.rate ?? row.price ?? row.amount ?? row.normalized_rate);
  if (Number.isFinite(directRate) && directRate > 0) return true;
  if (Array.isArray(row.list_of_rates)) {
    return row.list_of_rates.some((entry) => Number(entry?.rate) > 0);
  }
  if (Array.isArray(row.rates)) {
    return row.rates.some((entry) => Number(entry?.rate) > 0);
  }
  return false;
}

function isHotelRateRow(row = {}) {
  if (row.is_hotel_rate === true) return true;
  if (String(row.kind || '').trim().toLowerCase() === 'hotel_rate') return true;
  return !normalizeText(row.competitor_name) && rowHasValidRate(row);
}

function matchesAliases(value, aliases) {
  for (const alias of buildAliases(value, '')) {
    if (aliases.has(alias)) return true;
  }
  return false;
}

function analyzeOtaSnapshot(hotel, snapshot) {
  const hotelAliases = buildAliases(hotel.hotel_name, hotel.city);
  const competitorAliases = new Set();
  for (const name of Array.isArray(hotel.comp_set_json) ? hotel.comp_set_json : []) {
    for (const alias of buildAliases(name, hotel.city)) competitorAliases.add(alias);
  }

  const summary = {
    snapshotPath: snapshot.path,
    snapshotRows: snapshot.rows.length,
    cityCandidateRows: 0,
    matchedHotelRows: 0,
    hotelRateRows: 0,
    matchedCompetitorRows: 0,
    matchedChannelRows: 0,
    skippedUnknownHotel: 0,
    skippedInvalidRate: 0,
    skippedMissingCompetitorName: 0,
    malformedSnapshot: snapshot.malformed,
  };

  for (const row of snapshot.rows) {
    const hotelMatch = matchesAliases(row.hotel_name, hotelAliases);
    const inferredCity = inferOtaRowCity(row, hotelAliases);
    const cityMatch = inferredCity === hotel.city;
    if (!hotelMatch && !cityMatch) continue;

    summary.cityCandidateRows += 1;

    if (!hotelMatch && cityMatch) {
      summary.skippedUnknownHotel += 1;
      continue;
    }

    summary.matchedHotelRows += 1;

    if (isHotelRateRow(row)) {
      if (!rowHasValidRate(row)) {
        summary.skippedInvalidRate += 1;
      } else {
        summary.hotelRateRows += 1;
      }
      continue;
    }

    const competitorName = normalizeText(row.competitor_name);
    if (!competitorName) {
      summary.skippedMissingCompetitorName += 1;
      continue;
    }

    if (!rowHasValidRate(row)) {
      summary.skippedInvalidRate += 1;
      continue;
    }

    summary.matchedCompetitorRows += 1;

    const otaLike = OTA_CHANNEL_PATTERN.test(
      `${competitorName} ${normalizeText(row.website_url)} ${normalizeText(row.url)}`,
    );
    if (otaLike) {
      summary.matchedChannelRows += 1;
      continue;
    }

    if (!matchesAliases(competitorName, competitorAliases)) {
      // HOTELRADAR: We count the row as matched for the hotel, but the comp-set mismatch
      // still explains why parity/live-channel metrics may stay weak after ingestion.
      summary.skippedUnknownHotel += 0;
    }
  }

  return summary;
}

function analyzeEventSnapshot(hotel, snapshot, ingestedEvents = []) {
  const cityKey = normalizeName(hotel.city);
  const sourceBreakdown = new Map();
  let cityRows = 0;
  let upcomingRows = 0;

  for (const row of snapshot.rows) {
    const rowCity = canonicalCity(row.city || row.market || row.destination);
    if (normalizeName(rowCity) !== cityKey) continue;
    cityRows += 1;
    const source = normalizeText(row.source || row.provider || 'unknown') || 'unknown';
    sourceBreakdown.set(source, Number(sourceBreakdown.get(source) || 0) + 1);

    const endDate = String(row.end_date || row.endDate || row.date || '');
    if (!endDate || endDate >= new Date().toISOString().slice(0, 10)) {
      upcomingRows += 1;
    }
  }

  return {
    snapshotPath: snapshot.path,
    snapshotRows: snapshot.rows.length,
    cityRows,
    upcomingRows,
    ingestedRows: Array.isArray(ingestedEvents) ? ingestedEvents.length : 0,
    malformedSnapshot: snapshot.malformed,
    sourceBreakdown: Array.from(sourceBreakdown.entries())
      .map(([source, rows]) => ({ source, rows }))
      .sort((a, b) => b.rows - a.rows || a.source.localeCompare(b.source)),
  };
}

export async function buildSignalDiagnostics(hotel, input = {}, deps = defaultDeps) {
  if (!hotel?.city || !hotel?.hotel_name) return null;

  const [otaSnapshot, eventSnapshot] = await Promise.all([
    loadSnapshotRows(chooseOtaSnapshotCandidates(input.otaSnapshotPath), deps),
    loadSnapshotRows(chooseEventSnapshotCandidates(input.eventSnapshotPath), deps),
  ]);

  return {
    ota: analyzeOtaSnapshot(hotel, otaSnapshot),
    events: analyzeEventSnapshot(hotel, eventSnapshot, input.events || []),
    freshness: {
      competitorScrapeAt: input.lastScrapedAt ? new Date(input.lastScrapedAt).toISOString() : null,
      eventSyncAt: input.lastEventSync ? new Date(input.lastEventSync).toISOString() : null,
    },
  };
}
