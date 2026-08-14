import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { focusCities, focusCityKeys } from '../../config/productScope.js';
import { getBlockedEventReason } from '../../utils/eventValidation.js';
import { isPhysicalEventRecord } from '../../utils/eventVisibility.js';
import { addDays, dateToKey, isWeekend, toDateOnly } from '../../utils/date.js';

const DEFAULT_SOURCES = [
  { city: 'Goa', source: 'insider.in', url: 'https://insider.in/goa/all-events' },
  { city: 'Mumbai', source: 'insider.in', url: 'https://insider.in/mumbai/all-events' },
  { city: 'Jaipur', source: 'insider.in', url: 'https://insider.in/jaipur/all-events' },
  { city: 'Goa', source: 'bookmyshow.com', url: 'https://in.bookmyshow.com/explore/events-goa' },
  { city: 'Mumbai', source: 'bookmyshow.com', url: 'https://in.bookmyshow.com/explore/events-mumbai' },
  { city: 'Jaipur', source: 'bookmyshow.com', url: 'https://in.bookmyshow.com/explore/events-jaipur' },
  { city: 'Jaipur', source: 'allevents.in', url: 'https://allevents.in/jaipur/all' },
  {
    city: 'Jaipur',
    source: 'eventbrite.com',
    url: 'https://www.eventbrite.com/d/india--jaipur/events/',
  },
];

const DEFAULT_OUTPUT_PATH = '/opt/radar_light/shared/event_snapshots/latest.json';
const DEFAULT_HORIZON_DAYS = 60;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

const CATEGORY_KEYWORDS = [
  { category: 'wedding_season', patterns: [/\bwedding\b/i, /\bshaadi\b/i, /\bbridal\b/i, /destination wedding/i] },
  { category: 'ipl_match', patterns: [/\bipl\b/i, /\bcricket\b/i, /\bmatch\b/i, /wankhede/i] },
  { category: 'conference', patterns: [/\bconference\b/i, /\bsummit\b/i, /\bforum\b/i, /\bcorporate\b/i, /\bb2b\b/i] },
  { category: 'exhibition', patterns: [/\bexpo\b/i, /\bexhibition\b/i, /\btrade show\b/i] },
  { category: 'music_festival', patterns: [/\bfestival\b/i, /\bmusic\b/i, /concert/i, /sunburn/i] },
  { category: 'cultural_festival', patterns: [/\bcarnival\b/i, /\bcultural\b/i, /\barts\b/i, /celebration/i] },
];

const BASE_IMPACT = {
  music_festival: { large: 18, medium: 10, small: 4 },
  ipl_match: { large: 14, medium: 12, small: 8 },
  exhibition: { large: 9, medium: 6, small: 3 },
  conference: { large: 8, medium: 5, small: 3 },
  public_holiday: { large: 12, medium: 10, small: 8 },
  cultural_festival: { large: 10, medium: 7, small: 4 },
  wedding_season: { large: 12, medium: 8, small: 5 },
  general: { large: 7, medium: 5, small: 3 },
};

const CITY_CATEGORY_MULTIPLIER = {
  goa: {
    wedding_season: 1.45,
    music_festival: 1.2,
  },
  mumbai: {
    conference: 1.35,
    exhibition: 1.25,
    ipl_match: 1.15,
  },
};

const defaultDeps = {
  fetchImpl: global.fetch.bind(global),
  readFile: fs.readFile,
  writeFile: fs.writeFile,
  mkdir: fs.mkdir,
};
const BOOKMYSHOW_DEBUG_SAMPLE_LIMIT = 20000;

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

function cityInScope(city = '') {
  const key = String(city || '').trim().toLowerCase();
  return focusCityKeys.includes(key);
}

function parseSourceSpec(raw) {
  const spec = normalizeText(raw);
  if (!spec) return null;

  const [cityRaw, sourceRaw, urlRaw] = spec.split('|').map((part) => normalizeText(part));
  const city = canonicalCity(cityRaw);
  if (!city || !sourceRaw || !urlRaw) return null;
  if (!cityInScope(city)) return null;

  return {
    city,
    source: sourceRaw.toLowerCase(),
    url: urlRaw,
  };
}

function parseSourceSpecs(rawValue = '') {
  const specs = String(rawValue || '')
    .split(',')
    .map((entry) => parseSourceSpec(entry))
    .filter(Boolean);
  return specs;
}

function buildSourceList() {
  const configured = parseSourceSpecs(env.eventSourceUrls || '');
  if (configured.length) return configured;
  return DEFAULT_SOURCES.filter((entry) => cityInScope(entry.city));
}

function extractJsonLdBlocks(html = '') {
  const blocks = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const payload = normalizeText(match[1]);
    if (!payload) continue;
    try {
      blocks.push(JSON.parse(payload));
    } catch {
      // ignore malformed blocks
    }
  }
  return blocks;
}

function extractTitle(html = '') {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return '';
  return normalizeText(match[1]).replace(/\s*\|\s*LinkedIn.*$/i, '');
}

function extractFirstDateToken(text = '') {
  const match = String(text || '').match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] || '';
}

function collectEventNodes(node, output = []) {
  if (!node) return output;
  if (Array.isArray(node)) {
    for (const item of node) collectEventNodes(item, output);
    return output;
  }

  const type = String(node['@type'] || '').toLowerCase();
  if (type === 'event') {
    output.push(node);
  }

  if (Array.isArray(node.itemListElement)) {
    for (const item of node.itemListElement) {
      collectEventNodes(item?.item || item, output);
    }
  }

  if (Array.isArray(node['@graph'])) {
    for (const item of node['@graph']) {
      collectEventNodes(item, output);
    }
  }

  return output;
}

function parseDate(raw, fallback = null) {
  const value = normalizeText(raw);
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return dateToKey(parsed);
}

function classifyCategory({ name = '', description = '' }) {
  const text = `${name} ${description}`.toLowerCase();
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.category;
    }
  }
  return 'general';
}

function inferScale({ name = '', description = '', attendance = null, category = 'general' }) {
  const text = `${name} ${description}`.toLowerCase();
  const numericAttendance = Number(attendance);

  if (Number.isFinite(numericAttendance) && numericAttendance >= 15000) return 'large';
  if (Number.isFinite(numericAttendance) && numericAttendance <= 800) return 'small';

  if (/international|mega|festival|expo|summit|ipl/i.test(text)) return 'large';
  if (/workshop|meetup|networking/i.test(text)) return 'small';
  if (category === 'ipl_match') return 'large';

  return 'medium';
}

function impactScoreFor(city, category, scale) {
  const cityKey = String(city || '').toLowerCase();
  const base = BASE_IMPACT[category]?.[scale] ?? BASE_IMPACT.general[scale] ?? 5;
  const multiplier = CITY_CATEGORY_MULTIPLIER[cityKey]?.[category] ?? 1;
  return Math.max(0, Math.min(40, Number((base * multiplier).toFixed(2))));
}

function eventFromJsonLd(node, sourceDef, nowIso) {
  const name = normalizeText(node.name || node.headline || node.alternateName);
  const description = normalizeText(node.description);
  const city = canonicalCity(sourceDef.city || node?.location?.address?.addressLocality);
  const startDate = parseDate(node.startDate, null);
  const endDate = parseDate(node.endDate, startDate);

  if (!name || !city || !startDate || !endDate) return null;

   const attendanceMode = normalizeText(
    node.eventAttendanceMode ||
      node?.eventAttendanceMode?.['@id'] ||
      node?.eventAttendanceMode?.name ||
      '',
  ).toLowerCase();
  const locationType = normalizeText(node?.location?.['@type'] || '').toLowerCase();
  if (attendanceMode.includes('online') || locationType === 'virtuallocation') {
    return null;
  }

  const attendance = Number(node.maximumAttendeeCapacity || node.attendeeCount || 0) || null;
  const category = classifyCategory({ name, description });
  const scale = inferScale({ name, description, attendance, category });

  const venue = normalizeText(
    node?.location?.name ||
      node?.location?.address?.streetAddress ||
      node?.location?.address?.name ||
      '',
  );

  return {
    name,
    city,
    venue,
    start_date: startDate,
    end_date: endDate,
    category,
    scale,
    estimated_attendance: attendance,
    radius_impact_km: city === 'Mumbai' ? 12 : 20,
    source: sourceDef.source,
    confidence: 'confirmed',
    event_url: normalizeText(node.url || sourceDef.url) || null,
    impact_score: impactScoreFor(city, category, scale),
    scraped_at: nowIso,
  };
}

function extractBookMyShowVenue(html = '') {
  const patterns = [
    /"venue"\s*:\s*"([^"]+)"/i,
    /"venueName"\s*:\s*"([^"]+)"/i,
    /"location"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["'][^"']*?\bat\s+([^"|,]+)[^"']*["']/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(String(html || ''));
    const value = normalizeText(match?.[1] || '').replace(/\\u0026/g, '&');
    if (value) return value;
  }

  return '';
}

function eventFromHtmlFallback(html = '', sourceDef = {}, nowIso) {
  const city = canonicalCity(sourceDef.city);
  if (!city) return null;

  const title = extractTitle(html);
  if (!title) return null;

  const textWindow = String(html || '').slice(0, 12000);
  const dateToken = extractFirstDateToken(textWindow);
  const startDate = parseDate(dateToken, null);
  if (!startDate) return null;

  const category = classifyCategory({ name: title, description: textWindow });
  const scale = inferScale({ name: title, description: textWindow, category });
  const venue = sourceDef.source === 'bookmyshow.com'
    ? extractBookMyShowVenue(html)
    : normalizeText(sourceDef.city) || city;

  if (sourceDef.source === 'bookmyshow.com' && !venue) {
    return null;
  }

  if (
    !isPhysicalEventRecord({
      event_name: title,
      venue,
      category,
    })
  ) {
    return null;
  }

  return {
    name: title,
    city,
    venue,
    start_date: startDate,
    end_date: startDate,
    category,
    scale,
    estimated_attendance: null,
    radius_impact_km: city === 'Mumbai' ? 12 : 20,
    source: sourceDef.source || 'html-fallback',
    confidence: sourceDef.source?.includes('linkedin') ? 'tentative' : 'confirmed',
    event_url: normalizeText(sourceDef.url) || null,
    impact_score: impactScoreFor(city, category, scale),
    scraped_at: nowIso,
  };
}

function filterPhysicalRows(rows = []) {
  return rows.filter((row) =>
    isPhysicalEventRecord({
      event_name: row?.name,
      venue: row?.venue,
      category: row?.category,
    }),
  );
}

function dedupeEvents(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [
      String(row.city || '').toLowerCase(),
      String(row.name || '').toLowerCase(),
      String(row.start_date || ''),
      String(row.source || '').toLowerCase(),
    ].join('|');
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

function generateGoaWeddingSignals(horizonDays, nowDate = new Date()) {
  const today = toDateOnly(nowDate);
  const rows = [];

  for (let i = 0; i <= horizonDays; i += 1) {
    const day = addDays(today, i);
    const month = day.getUTCMonth();
    const inWeddingWindow = month === 9 || month === 10 || month === 11 || month === 0 || month === 1 || month === 2;
    if (!inWeddingWindow || !isWeekend(day)) continue;

    const date = dateToKey(day);
    rows.push({
      name: 'Goa Destination Wedding Window',
      city: 'Goa',
      venue: 'North Goa Wedding Belt',
      start_date: date,
      end_date: date,
      category: 'wedding_season',
      scale: 'medium',
      estimated_attendance: null,
      radius_impact_km: 30,
      source: 'wedding-calendar',
      confidence: 'tentative',
      event_url: null,
      impact_score: impactScoreFor('Goa', 'wedding_season', 'medium'),
      scraped_at: new Date().toISOString(),
    });
  }

  return rows;
}

function withinHorizon(dateKey, horizonDays, nowDate) {
  const today = toDateOnly(nowDate);
  const target = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return false;
  const diffDays = Math.floor((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= horizonDays;
}

function generateAugustImportantDateSignals(horizonDays, nowDate = new Date()) {
  const year = nowDate.getUTCFullYear();
  const windowsByYear = {
    2026: [
      {
        name: 'Independence Day Weekend Demand Window',
        start_date: '2026-08-15',
        end_date: '2026-08-16',
        category: 'public_holiday',
        scale: 'large',
        impactScale: 'large',
        confidence: 'confirmed',
        event_url: 'https://www.incredibleindia.gov.in/en/festivals-and-events/independence-day',
      },
      {
        name: 'Rakhi Long Weekend Family Travel Window',
        start_date: '2026-08-28',
        end_date: '2026-08-30',
        category: 'cultural_festival',
        scale: 'large',
        impactScale: 'large',
        confidence: 'confirmed',
        event_url: 'https://www.incredibleindia.gov.in/en/festivals-and-events/rakshabandhan',
      },
      {
        name: 'Milad-un-Nabi Midweek Holiday Watch',
        start_date: '2026-08-26',
        end_date: '2026-08-26',
        category: 'public_holiday',
        scale: 'medium',
        impactScale: 'medium',
        confidence: 'confirmed',
        event_url: null,
      },
    ],
  };

  const windows = windowsByYear[year] || [];
  const nowIso = new Date().toISOString();
  const rows = [];

  for (const window of windows) {
    if (!withinHorizon(window.start_date, horizonDays, nowDate)) continue;
    for (const city of focusCities) {
      rows.push({
        name: window.name,
        city,
        venue: `${city} market-wide demand window`,
        start_date: window.start_date,
        end_date: window.end_date,
        category: window.category,
        scale: window.scale,
        estimated_attendance: null,
        radius_impact_km: city === 'Mumbai' ? 12 : 30,
        source: 'verified-august-calendar',
        confidence: window.confidence,
        event_url: window.event_url,
        impact_score: impactScoreFor(city, window.category, window.impactScale),
        scraped_at: nowIso,
      });
    }
  }

  return rows;
}

async function loadLinkedInHints(filePath, deps) {
  const pathValue = normalizeText(filePath);
  if (!pathValue) return [];

  try {
    const payload = await deps.readFile(pathValue, 'utf8');
    const parsed = JSON.parse(payload);
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
    if (!Array.isArray(rows)) return [];

    const nowIso = new Date().toISOString();
    return rows
      .map((row) => {
        const city = canonicalCity(row.city);
        const name = normalizeText(row.name || row.event_name || row.title);
        const startDate = parseDate(row.start_date || row.date, null);
        const endDate = parseDate(row.end_date, startDate);
        if (!city || !cityInScope(city) || !name || !startDate || !endDate) return null;

        const description = normalizeText(row.description);
        const category = normalizeText(row.category) || classifyCategory({ name, description });
        const scale = normalizeText(row.scale) || inferScale({ name, description, category });

        return {
          name,
          city,
          venue: normalizeText(row.venue || 'Corporate Hub'),
          start_date: startDate,
          end_date: endDate,
          category,
          scale,
          estimated_attendance: Number(row.estimated_attendance) || null,
          radius_impact_km: Number(row.radius_impact_km) || (city === 'Mumbai' ? 12 : 20),
          source: 'linkedin-hints',
          confidence: normalizeText(row.confidence || 'tentative').toLowerCase(),
          event_url: normalizeText(row.event_url || row.url) || null,
          impact_score: Number(row.impact_score) || impactScoreFor(city, category, scale),
          scraped_at: row.scraped_at || nowIso,
        };
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn('event_collection_linkedin_hints_failed', {
        filePath: pathValue,
        error: error.message,
      });
    }
    return [];
  }
}

function resolveOutputPath(overridePath) {
  if (normalizeText(overridePath)) return String(overridePath).trim();
  if (normalizeText(env.eventSnapshotFile)) return env.eventSnapshotFile;
  return DEFAULT_OUTPUT_PATH;
}

function sanitizeFileToken(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function buildBookMyShowDebugBasePath(outputPath) {
  const outputDir = path.dirname(outputPath);
  return path.join(outputDir, 'debug-bookmyshow');
}

async function writeBookMyShowDebugCapture({ html = '', sourceDef = {}, outputPath = '', deps, reason = '' }) {
  const debugBasePath = buildBookMyShowDebugBasePath(outputPath);
  await deps.mkdir(debugBasePath, { recursive: true });

  const cityToken = sanitizeFileToken(sourceDef.city);
  const htmlPath = path.join(debugBasePath, `${cityToken}.html`);
  const metaPath = path.join(debugBasePath, `${cityToken}.json`);
  const htmlSample = String(html || '').slice(0, BOOKMYSHOW_DEBUG_SAMPLE_LIMIT);
  const metadata = {
    captured_at: new Date().toISOString(),
    city: sourceDef.city,
    source: sourceDef.source,
    url: sourceDef.url,
    reason,
    html_length: String(html || '').length,
    title: extractTitle(html),
    first_date_token: extractFirstDateToken(html),
    extracted_venue: extractBookMyShowVenue(html),
  };

  await deps.writeFile(htmlPath, htmlSample, 'utf8');
  await deps.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  logger.warn('event_collection_bookmyshow_debug_written', {
    city: sourceDef.city,
    url: sourceDef.url,
    htmlPath,
    metaPath,
    reason,
  });
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const safeTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(1000, Number(timeoutMs))
    : DEFAULT_FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function runEventCollectionCycle(options = {}, deps = defaultDeps) {
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const outputPath = resolveOutputPath(options.outputPath);
  const sources = options.sources || buildSourceList();
  const horizonDays = Number.isFinite(Number(options.horizonDays))
    ? Number(options.horizonDays)
    : DEFAULT_HORIZON_DAYS;
  const fetchTimeoutMs = Number.isFinite(Number(options.fetchTimeoutMs))
    ? Number(options.fetchTimeoutMs)
    : Number.isFinite(Number(env.eventCollectTimeoutMs))
      ? Number(env.eventCollectTimeoutMs)
      : DEFAULT_FETCH_TIMEOUT_MS;

  const summary = {
    startedAt: nowIso,
    outputPath,
    sourceCount: sources.length,
    fetchTimeoutMs,
    sourceSuccess: 0,
    sourceFailed: 0,
    rowsCollected: 0,
    rowsAfterDedup: 0,
    rowsWritten: 0,
    rowsBlocked: 0,
    weddingSignalsAdded: 0,
    augustImportantDateSignalsAdded: 0,
    linkedinHintsAdded: 0,
    bookmyshowDebugWritten: 0,
    sourceResults: [],
    durationMs: 0,
  };

  const collectedRows = [];

  for (const sourceDef of sources) {
    try {
      const response = await fetchWithTimeout(deps.fetchImpl, sourceDef.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HotelRADAR Event Collector/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      }, fetchTimeoutMs);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const blocks = extractJsonLdBlocks(html);
      const eventNodes = blocks.flatMap((block) => collectEventNodes(block, []));
      const events = filterPhysicalRows(eventNodes
        .map((node) => eventFromJsonLd(node, sourceDef, nowIso))
        .filter(Boolean));
      if (!events.length) {
        const fallback = eventFromHtmlFallback(html, sourceDef, nowIso);
        if (fallback) events.push(fallback);
      }
      if (!events.length && sourceDef.source === 'bookmyshow.com') {
        await writeBookMyShowDebugCapture({
          html,
          sourceDef,
          outputPath,
          deps,
          reason: 'no_events_parsed',
        });
        summary.bookmyshowDebugWritten += 1;
      }

      collectedRows.push(...events);
      summary.sourceSuccess += 1;
      summary.sourceResults.push({
        city: sourceDef.city,
        source: sourceDef.source,
        url: sourceDef.url,
        status: 'success',
        rowsCollected: events.length,
      });
    } catch (error) {
      summary.sourceFailed += 1;
      summary.sourceResults.push({
        city: sourceDef.city,
        source: sourceDef.source,
        url: sourceDef.url,
        status: 'failed',
        error: error.message,
      });
      logger.warn('event_collection_source_failed', {
        city: sourceDef.city,
        source: sourceDef.source,
        url: sourceDef.url,
        error: error.message,
      });
    }
  }

  if (options.includeWeddingSignals ?? env.enableWeddingSignalGenerator) {
    const weddingSignals = generateGoaWeddingSignals(horizonDays, new Date());
    collectedRows.push(...weddingSignals);
    summary.weddingSignalsAdded = weddingSignals.length;
  }

  if (options.includeAugustImportantDates ?? env.enableAugustImportantDateGenerator) {
    const augustSignals = generateAugustImportantDateSignals(horizonDays, new Date());
    collectedRows.push(...augustSignals);
    summary.augustImportantDateSignalsAdded = augustSignals.length;
  }

  const linkedinRows = await loadLinkedInHints(
    options.linkedinHintsFile || env.eventLinkedinHintsFile,
    deps,
  );
  collectedRows.push(...linkedinRows);
  summary.linkedinHintsAdded = linkedinRows.length;

  const filteredRows = [];
  for (const row of collectedRows) {
    const blockedReason = getBlockedEventReason({
      category: row.category,
      startDate: row.start_date,
    });
    if (blockedReason) {
      summary.rowsBlocked += 1;
      logger.warn('event_collection_row_blocked', {
        city: row.city,
        eventName: row.name,
        startDate: row.start_date,
        category: row.category,
        source: row.source,
        blockedReason,
      });
      continue;
    }
    filteredRows.push(row);
  }

  summary.rowsCollected = collectedRows.length;
  const deduped = dedupeEvents(filteredRows);
  summary.rowsAfterDedup = deduped.length;

  const outputDir = path.dirname(outputPath);
  await deps.mkdir(outputDir, { recursive: true });
  await deps.writeFile(outputPath, `${JSON.stringify(deduped, null, 2)}\n`, 'utf8');
  summary.rowsWritten = deduped.length;
  summary.durationMs = Date.now() - startedAt;

  logger.info('event_collection_completed', summary);
  return summary;
}

export {
  buildSourceList,
  classifyCategory,
  dedupeEvents,
  eventFromJsonLd,
  extractJsonLdBlocks,
  generateGoaWeddingSignals,
  generateAugustImportantDateSignals,
  impactScoreFor,
  parseSourceSpec,
  eventFromHtmlFallback,
  extractBookMyShowVenue,
};
