import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { upsertCityEvent } from '../../repositories/eventRepository.js';
import { getBlockedEventReason } from '../../utils/eventValidation.js';

const DEFAULT_EVENT_SNAPSHOT_PATHS = [
  '/opt/radar_light/shared/event_snapshots/latest.json',
  '/opt/radar_light/shared/events/latest.json',
];

const EVENT_IMPACT_TABLE = {
  music_festival: { large: 18, medium: 10, small: 4 },
  ipl_match: { large: 14, medium: 14, small: 14 },
  exhibition: { large: 8, medium: 5, small: 2 },
  conference: { large: 7, medium: 4, small: 2 },
  public_holiday: { large: 12, medium: 12, small: 12 },
  cultural_festival: { large: 10, medium: 6, small: 3 },
  wedding_season: { large: 6, medium: 6, small: 6 },
  general: { large: 8, medium: 5, small: 3 },
};

const defaultDeps = {
  readFile: fs.readFile,
  upsertCityEvent,
};

function normalizeText(value = '') {
  return String(value || '').trim();
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

function normalizeCategory(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return 'general';
  return value.replace(/\s+/g, '_');
}

function normalizeScale(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  if (value === 'xl' || value === 'x-large' || value === 'xlarge') return 'large';
  return 'medium';
}

function normalizeConfidence(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (value === 'confirmed' || value === 'tentative' || value === 'rumor') return value;
  return 'confirmed';
}

function parseDate(rawDate, fallback = null) {
  const value = normalizeText(rawDate);
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString().slice(0, 10);
}

function deriveImpactScore({ category, scale, impactScore }) {
  const explicit = Number(impactScore);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(40, explicit));

  const categoryMap = EVENT_IMPACT_TABLE[category] || EVENT_IMPACT_TABLE.general;
  const baseline = Number(categoryMap?.[scale] || categoryMap?.medium || 5);
  return Math.max(0, Math.min(40, baseline));
}

function chooseSnapshotPath(overridePath, cwd = process.cwd()) {
  if (overridePath) return overridePath;
  if (env.eventSnapshotFile && normalizeText(env.eventSnapshotFile)) return env.eventSnapshotFile;
  const relativeCandidate = path.resolve(cwd, 'tmp', 'events.latest.json');
  return [relativeCandidate, ...DEFAULT_EVENT_SNAPSHOT_PATHS];
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
        const error = new Error('Event snapshot JSON must be an array or { rows: [] }.');
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

function toEventPayload(rawRow, nowIso) {
  const city = canonicalCity(rawRow.city || rawRow.market || rawRow.destination);
  const eventName = normalizeText(rawRow.name || rawRow.event_name || rawRow.title);
  const startDate = parseDate(rawRow.start_date || rawRow.startDate || rawRow.date, null);
  const endDate = parseDate(rawRow.end_date || rawRow.endDate, startDate);
  const category = normalizeCategory(rawRow.category || rawRow.type);
  const scale = normalizeScale(rawRow.scale || rawRow.size || rawRow.event_scale);
  const confidence = normalizeConfidence(rawRow.confidence || rawRow.status);
  const source = normalizeText(rawRow.source || rawRow.provider || 'snapshot').toLowerCase();
  const venue = normalizeText(rawRow.venue || rawRow.location || rawRow.place);
  const impactScore = deriveImpactScore({
    category,
    scale,
    impactScore: rawRow.impact_score,
  });

  if (!city || !eventName || !startDate || !endDate) return null;

  return {
    city,
    eventName,
    venue,
    startDate,
    endDate,
    category,
    scale,
    estimatedAttendance:
      Number.isFinite(Number(rawRow.estimated_attendance || rawRow.attendance))
        ? Number(rawRow.estimated_attendance || rawRow.attendance)
        : null,
    radiusImpactKm: Number.isFinite(Number(rawRow.radius_impact_km || rawRow.radius_km))
      ? Number(rawRow.radius_impact_km || rawRow.radius_km)
      : 15,
    source,
    confidence,
    venueLat: Number.isFinite(Number(rawRow.venue_lat || rawRow.lat))
      ? Number(rawRow.venue_lat || rawRow.lat)
      : null,
    venueLng: Number.isFinite(Number(rawRow.venue_lng || rawRow.lng || rawRow.lon))
      ? Number(rawRow.venue_lng || rawRow.lng || rawRow.lon)
      : null,
    eventUrl: normalizeText(rawRow.event_url || rawRow.url || rawRow.link) || null,
    impactScore,
    scrapedAt: parseDate(rawRow.scraped_at, null) ? rawRow.scraped_at : nowIso,
  };
}

export async function runEventIngestionCycle(options = {}, deps = defaultDeps) {
  const cycleStarted = Date.now();
  const nowIso = new Date().toISOString();
  const summary = {
    startedAt: nowIso,
    snapshotPath: null,
    rowsRead: 0,
    rowsUpserted: 0,
    skippedRows: 0,
    skippedInvalidRow: 0,
    skippedBlockedRow: 0,
    missingSnapshot: false,
    durationMs: 0,
  };

  const snapshotPathCandidate = chooseSnapshotPath(options.snapshotPath);
  const snapshot = await loadSnapshotRows(snapshotPathCandidate, deps);
  summary.snapshotPath = snapshot.path;
  summary.rowsRead = snapshot.rows.length;

  if (!snapshot.rows.length) {
    summary.missingSnapshot = true;
    summary.durationMs = Date.now() - cycleStarted;
    logger.warn('event_ingestion_skipped_no_snapshot', summary);
    return summary;
  }

  for (const rawRow of snapshot.rows) {
    const payload = toEventPayload(rawRow, nowIso);
    if (!payload) {
      summary.skippedRows += 1;
      summary.skippedInvalidRow += 1;
      continue;
    }

    const blockedReason = getBlockedEventReason(payload);
    if (blockedReason) {
      summary.skippedRows += 1;
      summary.skippedBlockedRow += 1;
      logger.warn('event_ingestion_row_blocked', {
        city: payload.city,
        eventName: payload.eventName,
        startDate: payload.startDate,
        category: payload.category,
        source: payload.source,
        blockedReason,
      });
      continue;
    }

    await deps.upsertCityEvent(payload);
    summary.rowsUpserted += 1;
  }

  summary.durationMs = Date.now() - cycleStarted;
  logger.info('event_ingestion_completed', summary);
  return summary;
}
