import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const DEFAULT_TIMEOUT_MS = 15000;

function cleanText(value = '') {
  return String(value || '').trim();
}

function defaultSignalType(source = {}) {
  const adapterType = cleanText(source.adapter_type || source.adapterType).toLowerCase();
  const sourceType = cleanText(source.source_type || source.sourceType).toLowerCase();
  if (adapterType === 'official_rate_manifest' || sourceType === 'official') return 'hotel_rate';
  if (adapterType === 'ota_rate_manifest' || adapterType === 'google_hotels_manifest' || sourceType === 'ota') return 'ota_rate';
  if (sourceType === 'competitor') return 'competitor_rate';
  if (adapterType === 'pms_manifest' || sourceType === 'pms') return 'pms_pickup';
  if (adapterType === 'digital_manifest' || sourceType === 'digital') return 'digital_asset_signal';
  if (adapterType === 'review_manifest' || sourceType === 'review') return 'review_velocity';
  if (adapterType === 'search_manifest' || sourceType === 'search') return 'search_trend';
  if (sourceType === 'event') return 'event_signal';
  if (sourceType === 'weather') return 'weather_signal';
  if (sourceType === 'airfare') return 'airfare_trend';
  return 'freshness';
}

function parseRows(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) throw new Error('Verified live data manifest must be an array or { rows: [] }.');
  return rows;
}

function isBlockedHost(hostname = '') {
  const host = cleanText(hostname).toLowerCase();
  return (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host === '169.254.169.254' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function isAllowedLocalPath(rawPath = '') {
  const resolved = path.resolve(rawPath);
  const cwdTmp = path.resolve(process.cwd(), 'tmp');
  return (
    resolved.startsWith('/opt/radar_light/shared/') ||
    resolved.startsWith(cwdTmp) ||
    resolved.startsWith('/tmp/')
  );
}

async function readSourcePayload(source, deps) {
  const sourceUrl = cleanText(source.source_url || source.sourceUrl);
  if (!sourceUrl) throw new Error('source_url is required.');

  if (/^https?:\/\//i.test(sourceUrl)) {
    const parsed = new URL(sourceUrl);
    if (!env.allowPrivateLiveDataSourceUrls && isBlockedHost(parsed.hostname)) {
      throw new Error(`Private or local source URL is not allowed: ${parsed.hostname}`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(env.liveDataSourceFetchTimeoutMs || DEFAULT_TIMEOUT_MS));
    try {
      const response = await deps.fetchImpl(sourceUrl, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  const filePath = sourceUrl.startsWith('file://') ? new URL(sourceUrl).pathname : sourceUrl;
  if (!isAllowedLocalPath(filePath)) {
    throw new Error('Local source file must be under /opt/radar_light/shared, project tmp, or /tmp.');
  }
  return deps.readFile(filePath, 'utf8');
}

function applySourceDefaults(row = {}, source = {}, nowIso) {
  const sourceType = cleanText(row.source_type || row.sourceType || source.source_type || source.sourceType);
  const sourceName = cleanText(row.source_name || row.sourceName || row.channel || source.source_name || source.sourceName);
  const sourceUrl = cleanText(source.source_url || source.sourceUrl);
  const sourceUrlCanBeProof = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : '';
  const proofUrl = cleanText(row.proof_url || row.proofUrl || row.url || row.website_url || row.websiteUrl || sourceUrlCanBeProof);
  const freshnessMinutes = Number(row.freshness_minutes || row.freshnessMinutes || source.freshness_minutes || source.freshnessMinutes || 120);
  const freshnessExpiresAt = row.freshness_expires_at || row.freshnessExpiresAt || new Date(new Date(nowIso).getTime() + Math.max(15, freshnessMinutes) * 60 * 1000).toISOString();

  return {
    ...row,
    hotel_id: row.hotel_id || row.hotelId || source.hotel_id || source.hotelId || null,
    hotel_name: row.hotel_name || row.hotelName || source.hotel_name || source.hotelName || '',
    city: row.city || source.city || '',
    source_type: sourceType,
    source_name: sourceName,
    signal_type: row.signal_type || row.signalType || defaultSignalType(source),
    proof_url: proofUrl,
    observed_at: row.observed_at || row.observedAt || nowIso,
    captured_at: row.captured_at || row.capturedAt || nowIso,
    freshness_expires_at: freshnessExpiresAt,
    connector_name: source.adapter_type || source.adapterType || 'json_manifest',
    metadata: {
      ...(row.metadata || {}),
      connectorSourceId: source.id || null,
      connectorSourceName: source.source_name || source.sourceName || sourceName,
      adapterType: source.adapter_type || source.adapterType || 'json_manifest',
      proofRequired: Boolean(source.proof_required || source.proofRequired),
    },
  };
}

const defaultDeps = {
  fetchImpl: globalThis.fetch,
  readFile: fs.readFile,
};

export async function collectVerifiedLiveDataSourceRows({ sources = [], nowIso = new Date().toISOString() } = {}, deps = defaultDeps) {
  const rows = [];
  const sourceResults = [];

  for (const source of sources) {
    const sourceId = source.id || null;
    try {
      if (!source.enabled && source.enabled !== undefined) {
        sourceResults.push({ sourceId, status: 'disabled', rows: 0, error: null });
        continue;
      }
      const payload = await readSourcePayload(source, deps);
      const parsedRows = parseRows(payload);
      for (const row of parsedRows) {
        rows.push(applySourceDefaults(row, source, nowIso));
      }
      sourceResults.push({
        sourceId,
        status: parsedRows.length ? 'ok' : 'partial',
        rows: parsedRows.length,
        error: null,
      });
    } catch (error) {
      logger.warn('verified_live_data_source_failed', {
        sourceId,
        sourceName: source.source_name || source.sourceName,
        error: error?.message || String(error),
      });
      sourceResults.push({
        sourceId,
        status: 'failed',
        rows: 0,
        error: error?.message || String(error),
      });
    }
  }

  return { rows, sourceResults };
}
