import fs from 'fs/promises';
import path from 'path';

const DEFAULT_CITY = 'Goa';
const DEFAULT_SLUG = 'the-ten';
const DEFAULT_HORIZON_DAYS = 15;
const ENGINE_VERSION = 'public_market_beta_capture_v1';

const CITY_COORDINATES = {
  goa: { latitude: 15.2993, longitude: 74.1240, airportCode: 'GOI' },
  jaipur: { latitude: 26.9124, longitude: 75.7873, airportCode: 'JAI' },
  mumbai: { latitude: 19.0760, longitude: 72.8777, airportCode: 'BOM' },
};

const INDIA_HOLIDAY_FALLBACKS = {
  2026: [
    {
      date: '2026-01-26',
      name: 'Republic Day',
      type: 'gazetted_holiday',
      proofUrl: 'https://www.indiapost.gov.in/holidays-list',
      score: 82,
    },
    {
      date: '2026-08-15',
      name: 'Independence Day',
      type: 'gazetted_holiday',
      proofUrl: 'https://www.indiapost.gov.in/holidays-list',
      score: 86,
    },
    {
      date: '2026-08-26',
      name: "Prophet Mohammad's Birthday / Id-e-Milad",
      type: 'gazetted_holiday',
      proofUrl: 'https://www.indiapost.gov.in/holidays-list',
      score: 78,
    },
    {
      date: '2026-08-28',
      name: 'Raksha Bandhan',
      type: 'restricted_holiday_family_travel',
      proofUrl: 'https://www.timeanddate.com/holidays/india/raksha-bandhan',
      score: 76,
    },
    {
      date: '2026-10-02',
      name: "Mahatma Gandhi's Birthday",
      type: 'gazetted_holiday',
      proofUrl: 'https://www.indiapost.gov.in/holidays-list',
      score: 82,
    },
    {
      date: '2026-12-25',
      name: 'Christmas Day',
      type: 'gazetted_holiday',
      proofUrl: 'https://www.indiapost.gov.in/holidays-list',
      score: 84,
    },
  ],
};

function cleanText(value = '') {
  return String(value || '').trim();
}

function slugify(value = '') {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || DEFAULT_SLUG;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumericOrNull(value) {
  const parsed = numericOrNull(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function currentIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateKey(value) {
  const raw = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const start = normalizeDateKey(dateString) || currentIndiaDate();
  const parsed = new Date(`${start}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}

function dateRange(startDate, horizonDays) {
  return Array.from({ length: Math.max(1, Math.min(31, Number(horizonDays || DEFAULT_HORIZON_DAYS))) }, (_, index) => addDays(startDate, index));
}

function manifestPath(baseDir, slug, fileName) {
  return path.resolve(baseDir, slugify(slug), fileName);
}

function cityCoordinates(city, latitude, longitude) {
  const suppliedLat = numericOrNull(latitude);
  const suppliedLng = numericOrNull(longitude);
  if (suppliedLat !== null && suppliedLng !== null) {
    return { latitude: suppliedLat, longitude: suppliedLng, airportCode: '' };
  }
  return CITY_COORDINATES[cleanText(city).toLowerCase()] || CITY_COORDINATES.goa;
}

async function readJsonFile(filePath, fallback = null, deps) {
  try {
    return JSON.parse(await deps.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && fallback !== null) return fallback;
    throw error;
  }
}

async function fileExists(filePath, deps) {
  try {
    if (typeof deps.access === 'function') await deps.access(filePath);
    else await deps.readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath, payload, deps) {
  await deps.mkdir(path.dirname(filePath), { recursive: true });
  await deps.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function rowKey(row = {}) {
  return [
    cleanText(row.source_type || row.sourceType).toLowerCase(),
    cleanText(row.source_name || row.sourceName).toLowerCase(),
    cleanText(row.signal_type || row.signalType).toLowerCase(),
    normalizeDateKey(row.checkin_date || row.checkinDate || row.stay_date || row.stayDate) || '',
  ].join('|');
}

function mergeRows(existingRows = [], newRows = []) {
  const orderedKeys = [];
  const byKey = new Map();
  for (const row of existingRows) {
    const key = rowKey(row);
    if (!key.replace(/\|/g, '')) continue;
    if (!byKey.has(key)) orderedKeys.push(key);
    byKey.set(key, row);
  }
  for (const row of newRows) {
    const key = rowKey(row);
    if (!key.replace(/\|/g, '')) continue;
    if (!byKey.has(key)) orderedKeys.push(key);
    byKey.set(key, row);
  }
  return orderedKeys.map((key) => byKey.get(key));
}

function normalizeTariffSnapshotRows(payload, context = {}) {
  const rawRows = Array.isArray(payload)
    ? payload
    : [
        ...(Array.isArray(payload?.official) ? payload.official : []),
        ...(Array.isArray(payload?.ota) ? payload.ota : []),
        ...(Array.isArray(payload?.competitor) ? payload.competitor : []),
        ...(Array.isArray(payload?.rows) ? payload.rows : []),
      ];
  const rows = [];
  const rejected = [];
  const nowIso = context.nowIso || new Date().toISOString();

  for (const raw of rawRows) {
    const sourceType = cleanText(raw.source_type || raw.sourceType).toLowerCase();
    const signalType =
      sourceType === 'official'
        ? 'hotel_rate'
        : sourceType === 'ota'
          ? 'ota_rate'
          : sourceType === 'competitor'
            ? 'competitor_rate'
            : cleanText(raw.signal_type || raw.signalType);
    const checkinDate = normalizeDateKey(raw.checkin_date || raw.checkinDate || raw.stay_date || raw.stayDate);
    const rate = positiveNumericOrNull(raw.rate ?? raw.price ?? raw.value_numeric ?? raw.valueNumeric);
    const sourceName = cleanText(raw.source_name || raw.sourceName || raw.channel || raw.provider || raw.competitor_name || raw.competitorName);
    const proofUrl = cleanText(raw.proof_url || raw.proofUrl || raw.url || raw.website_url || raw.websiteUrl);
    const reason = [];
    if (!['official', 'ota', 'competitor'].includes(sourceType)) reason.push('unsupported_rate_source_type');
    if (!checkinDate) reason.push('missing_checkin_date');
    if (!sourceName) reason.push('missing_source_name');
    if (rate === null) reason.push('missing_positive_rate');
    if (!proofUrl && !context.allowUnproofedTariff) reason.push('missing_proof_url');
    if (reason.length) {
      rejected.push({ row: raw, reason: reason.join(',') });
      continue;
    }
    rows.push({
      hotel_id: raw.hotel_id || raw.hotelId || context.hotelId || '<hotel_uuid>',
      hotel_name: raw.hotel_name || raw.hotelName || context.hotelName || '',
      city: raw.city || context.city || DEFAULT_CITY,
      checkin_date: checkinDate,
      source_type: sourceType,
      source_name: sourceName,
      signal_type: signalType,
      rate,
      currency: cleanText(raw.currency || 'INR') || 'INR',
      proof_url: proofUrl,
      observed_at: raw.observed_at || raw.observedAt || nowIso,
      freshness_expires_at: raw.freshness_expires_at || raw.freshnessExpiresAt || '',
      metadata: {
        ...(raw.metadata || {}),
        capture_engine: ENGINE_VERSION,
        capture_mode: proofUrl ? 'verified_tariff_snapshot' : 'operator_snapshot_needs_proof',
        occupancy: raw.occupancy || raw.adults || raw.metadata?.occupancy || 2,
        room_basis: raw.room_basis || raw.roomBasis || raw.metadata?.room_basis || 'base comparable room',
      },
    });
  }

  return { rows, rejected };
}

function normalizeDemandSnapshotRows(payload, context = {}) {
  const rawRows = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : [];
  const rows = [];
  const rejected = [];
  const nowIso = context.nowIso || new Date().toISOString();

  for (const raw of rawRows) {
    const sourceType = cleanText(raw.source_type || raw.sourceType).toLowerCase();
    const checkinDate = normalizeDateKey(raw.checkin_date || raw.checkinDate || raw.stay_date || raw.stayDate);
    const sourceName = cleanText(raw.source_name || raw.sourceName || raw.provider);
    const valueNumeric = numericOrNull(raw.value_numeric ?? raw.valueNumeric ?? raw.score ?? raw.pressure);
    const valueText = cleanText(raw.value_text || raw.valueText || raw.summary || raw.description);
    const proofUrl = cleanText(raw.proof_url || raw.proofUrl || raw.url || raw.website_url || raw.websiteUrl);
    const supportedSourceTypes = ['event', 'search', 'airfare', 'weather', 'digital', 'review', 'social'];
    const reason = [];
    if (!supportedSourceTypes.includes(sourceType)) reason.push('unsupported_demand_source_type');
    if (!checkinDate) reason.push('missing_checkin_date');
    if (!sourceName) reason.push('missing_source_name');
    if (valueNumeric === null && !valueText) reason.push('missing_signal_value');
    if (!proofUrl && context.proofRequired) reason.push('missing_proof_url');
    if (reason.length) {
      rejected.push({ row: raw, reason: reason.join(',') });
      continue;
    }
    rows.push({
      hotel_id: raw.hotel_id || raw.hotelId || context.hotelId || '<hotel_uuid>',
      hotel_name: raw.hotel_name || raw.hotelName || context.hotelName || '',
      city: raw.city || context.city || DEFAULT_CITY,
      checkin_date: checkinDate,
      source_type: sourceType,
      source_name: sourceName,
      signal_type: cleanText(raw.signal_type || raw.signalType) || (
        sourceType === 'airfare'
          ? 'airfare_trend'
          : sourceType === 'search'
            ? 'search_trend'
            : sourceType === 'weather'
              ? 'weather_signal'
              : sourceType === 'digital'
                ? 'digital_asset_signal'
                : sourceType === 'review'
                  ? 'review_velocity'
                  : sourceType === 'social'
                    ? 'social_signal'
                    : 'event_signal'
      ),
      value_numeric: valueNumeric,
      value_text: valueText,
      proof_url: proofUrl,
      observed_at: raw.observed_at || raw.observedAt || nowIso,
      metadata: {
        ...(raw.metadata || {}),
        capture_engine: ENGINE_VERSION,
        capture_mode: proofUrl ? 'verified_demand_snapshot' : 'operator_snapshot_needs_proof',
        category: raw.category || raw.metadata?.category || sourceType,
      },
    });
  }

  return { rows, rejected };
}

function holidayWindowDates(holidayDate) {
  const parsed = new Date(`${holidayDate}T00:00:00Z`);
  const weekday = parsed.getUTCDay();
  if (weekday === 5) return [holidayDate, addDays(holidayDate, 1), addDays(holidayDate, 2)];
  if (weekday === 6) return [holidayDate, addDays(holidayDate, 1)];
  if (weekday === 0) return [addDays(holidayDate, -1), holidayDate];
  if (weekday === 1) return [addDays(holidayDate, -2), addDays(holidayDate, -1), holidayDate];
  return [holidayDate];
}

function buildHolidayRows({ holidays = [], dates, city, hotelId, hotelName, nowIso, sourceName, sourceStatus }) {
  const rows = [];
  for (const holiday of Array.isArray(holidays) ? holidays : []) {
    const holidayDate = normalizeDateKey(holiday.date);
    if (!holidayDate) continue;
    for (const stayDate of holidayWindowDates(holidayDate)) {
      if (!dates.has(stayDate)) continue;
      const isExactHoliday = stayDate === holidayDate;
      const holidayName = holiday.name || holiday.localName || 'Public holiday';
      rows.push({
        hotel_id: hotelId || '<hotel_uuid>',
        hotel_name: hotelName || '',
        city,
        checkin_date: stayDate,
        source_type: 'event',
        source_name: sourceName,
        signal_type: 'event_signal',
        value_numeric: isExactHoliday ? Number(holiday.score || 86) : Math.max(62, Number(holiday.score || 76) - 10),
        value_text: `${holidayName}${isExactHoliday ? '' : ' weekend shoulder'} demand pressure`,
        proof_url: holiday.proofUrl || holiday.proof_url || '',
        observed_at: nowIso,
        metadata: {
          capture_engine: ENGINE_VERSION,
          source_status: sourceStatus,
          category: holiday.type || 'public_holiday',
          holiday_date: holidayDate,
          holiday_name: holidayName,
          local_name: holiday.localName || '',
          country_code: 'IN',
          confidence: sourceStatus === 'live' ? 'high' : 'fallback_verified_reference',
        },
      });
    }
  }
  return rows;
}

async function fetchHolidayRows({ city, hotelId, hotelName, startDate, horizonDays, nowIso }, deps) {
  const dates = new Set(dateRange(startDate, horizonDays));
  const years = [...new Set([...dates].map((date) => date.slice(0, 4)))];
  const rows = [];
  const sourceResults = [];

  for (const year of years) {
    const url = `https://date.nager.at/api/v3/publicholidays/${year}/IN`;
    try {
      const response = await deps.fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const holidays = JSON.parse(text);
      rows.push(...buildHolidayRows({
        holidays: (Array.isArray(holidays) ? holidays : []).map((holiday) => ({
          ...holiday,
          proofUrl: url,
          score: 86,
          type: 'public_holiday',
        })),
        dates,
        city,
        hotelId,
        hotelName,
        nowIso,
        sourceName: 'Nager.Date public holiday API',
        sourceStatus: 'live',
      }));
      sourceResults.push({ source: 'public_holidays', status: 'ok', rows: rows.length, url });
    } catch (error) {
      const fallbackRows = buildHolidayRows({
        holidays: INDIA_HOLIDAY_FALLBACKS[Number(year)] || [],
        dates,
        city,
        hotelId,
        hotelName,
        nowIso,
        sourceName: 'India holiday reference fallback',
        sourceStatus: 'fallback',
      });
      rows.push(...fallbackRows);
      sourceResults.push({
        source: 'public_holidays',
        status: fallbackRows.length ? 'fallback' : 'failed',
        rows: fallbackRows.length,
        url,
        error: error?.message || String(error),
      });
    }
  }

  return { rows, sourceResults };
}

function weatherPressure({ precipitation = 0, wind = 0, temperature = 0 } = {}) {
  const rain = numericOrNull(precipitation) || 0;
  const gust = numericOrNull(wind) || 0;
  const temp = numericOrNull(temperature) || 0;
  return Math.round(Math.max(20, Math.min(88, 35 + Math.min(35, rain * 6) + Math.min(12, Math.max(0, gust - 25) * 0.8) + (temp > 34 ? 6 : 0))));
}

async function fetchWeatherRows({ city, hotelId, hotelName, startDate, horizonDays, latitude, longitude, nowIso }, deps) {
  const coordinates = cityCoordinates(city, latitude, longitude);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(coordinates.latitude));
  url.searchParams.set('longitude', String(coordinates.longitude));
  url.searchParams.set('daily', 'precipitation_sum,weather_code,wind_speed_10m_max,temperature_2m_max');
  url.searchParams.set('forecast_days', String(Math.max(1, Math.min(16, Number(horizonDays || DEFAULT_HORIZON_DAYS)))));
  url.searchParams.set('timezone', 'Asia/Kolkata');

  try {
    const response = await deps.fetchImpl(url.toString(), { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const daily = payload?.daily || {};
    const targetDates = new Set(dateRange(startDate, horizonDays));
    const rows = [];
    for (let index = 0; index < (daily.time || []).length; index += 1) {
      const checkinDate = normalizeDateKey(daily.time[index]);
      if (!targetDates.has(checkinDate)) continue;
      const precipitation = numericOrNull(daily.precipitation_sum?.[index]) || 0;
      const wind = numericOrNull(daily.wind_speed_10m_max?.[index]) || 0;
      const temperature = numericOrNull(daily.temperature_2m_max?.[index]) || 0;
      const pressure = weatherPressure({ precipitation, wind, temperature });
      rows.push({
        hotel_id: hotelId || '<hotel_uuid>',
        hotel_name: hotelName || '',
        city,
        checkin_date: checkinDate,
        source_type: 'weather',
        source_name: 'Open-Meteo forecast API',
        signal_type: 'weather_signal',
        value_numeric: pressure,
        value_text: `Weather outlook: ${precipitation}mm rain, ${Math.round(wind)} km/h wind, ${Math.round(temperature)}°C max`,
        proof_url: 'https://open-meteo.com/en/docs',
        observed_at: nowIso,
        metadata: {
          capture_engine: ENGINE_VERSION,
          category: 'weather_forecast',
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          precipitation_sum_mm: precipitation,
          wind_speed_10m_max_kmh: wind,
          temperature_2m_max_c: temperature,
          weather_code: daily.weather_code?.[index] ?? null,
          confidence: 'supporting',
        },
      });
    }
    return {
      rows,
      sourceResults: [{ source: 'weather', status: rows.length ? 'ok' : 'partial', rows: rows.length, url: url.toString() }],
    };
  } catch (error) {
    return {
      rows: [],
      sourceResults: [{ source: 'weather', status: 'failed', rows: 0, url: url.toString(), error: error?.message || String(error) }],
    };
  }
}

function rowsByManifest(rows = []) {
  const grouped = {
    'official-rates.json': [],
    'ota-rates.json': [],
    'competitor-rates.json': [],
    'demand-signals.json': [],
  };
  for (const row of rows) {
    const sourceType = cleanText(row.source_type || row.sourceType).toLowerCase();
    if (sourceType === 'official') grouped['official-rates.json'].push(row);
    else if (sourceType === 'ota') grouped['ota-rates.json'].push(row);
    else if (sourceType === 'competitor') grouped['competitor-rates.json'].push(row);
    else grouped['demand-signals.json'].push(row);
  }
  return grouped;
}

async function mergeRowsIntoManifest(filePath, rows, deps) {
  if (!rows.length) return { filePath, addedRows: 0, totalRows: null, skipped: true };
  const manifest = await readJsonFile(filePath, { rows: [] }, deps);
  const before = Array.isArray(manifest.rows) ? manifest.rows : [];
  const merged = mergeRows(before, rows);
  await writeJsonFile(filePath, { ...manifest, rows: merged }, deps);
  return {
    filePath,
    addedRows: Math.max(0, merged.length - before.length),
    updatedRows: rows.length,
    totalRows: merged.length,
    skipped: false,
  };
}

const defaultDeps = {
  readFile: (...args) => fs.readFile(...args),
  writeFile: (...args) => fs.writeFile(...args),
  mkdir: (...args) => fs.mkdir(...args),
  access: (...args) => fs.access(...args),
  fetchImpl: globalThis.fetch,
};

export async function runPublicMarketCapture(options = {}, deps = defaultDeps) {
  const nowIso = options.nowIso || new Date().toISOString();
  const city = cleanText(options.city || DEFAULT_CITY);
  const slug = slugify(options.slug || options.hotelName || DEFAULT_SLUG);
  const baseDir = path.resolve(options.baseDir || path.resolve(process.cwd(), 'shared/live_sources'));
  const startDate = normalizeDateKey(options.startDate) || currentIndiaDate();
  const horizonDays = Math.max(1, Math.min(31, Number(options.horizonDays || DEFAULT_HORIZON_DAYS)));
  const context = {
    city,
    hotelId: options.hotelId || '',
    hotelName: options.hotelName || '',
    startDate,
    horizonDays,
    nowIso,
    latitude: options.latitude,
    longitude: options.longitude,
  };

  const generatedRows = [];
  const rejectedRows = [];
  const sourceResults = [];

  if (options.tariffSnapshotFile && await fileExists(path.resolve(options.tariffSnapshotFile), deps)) {
    const payload = await readJsonFile(path.resolve(options.tariffSnapshotFile), null, deps);
    const tariff = normalizeTariffSnapshotRows(payload, {
      ...context,
      allowUnproofedTariff: Boolean(options.allowUnproofedTariff),
    });
    generatedRows.push(...tariff.rows);
    rejectedRows.push(...tariff.rejected);
    sourceResults.push({
      source: 'tariff_snapshot',
      status: tariff.rows.length ? 'ok' : 'partial',
      rows: tariff.rows.length,
      rejectedRows: tariff.rejected.length,
      filePath: path.resolve(options.tariffSnapshotFile),
    });
  }

  if (options.demandSnapshotFile && await fileExists(path.resolve(options.demandSnapshotFile), deps)) {
    const payload = await readJsonFile(path.resolve(options.demandSnapshotFile), null, deps);
    const demand = normalizeDemandSnapshotRows(payload, {
      ...context,
      proofRequired: Boolean(options.demandProofRequired),
    });
    generatedRows.push(...demand.rows);
    rejectedRows.push(...demand.rejected);
    sourceResults.push({
      source: 'demand_snapshot',
      status: demand.rows.length ? 'ok' : 'partial',
      rows: demand.rows.length,
      rejectedRows: demand.rejected.length,
      filePath: path.resolve(options.demandSnapshotFile),
    });
  }

  if (options.includeHolidays !== false) {
    const holiday = await fetchHolidayRows(context, deps);
    generatedRows.push(...holiday.rows);
    sourceResults.push(...holiday.sourceResults);
  }

  if (options.includeWeather !== false) {
    const weather = await fetchWeatherRows(context, deps);
    generatedRows.push(...weather.rows);
    sourceResults.push(...weather.sourceResults);
  }

  const grouped = rowsByManifest(generatedRows);
  const files = [];
  for (const [fileName, rows] of Object.entries(grouped)) {
    files.push(await mergeRowsIntoManifest(manifestPath(baseDir, slug, fileName), rows, deps));
  }

  return {
    status: 'ok',
    engineVersion: ENGINE_VERSION,
    baseDir: path.resolve(baseDir, slug),
    city,
    slug,
    startDate,
    horizonDays,
    generatedRows: generatedRows.length,
    rejectedRows,
    sourceResults,
    files,
    nextStep: 'Run npm run ingestion:realtime-signals to import accepted rows into realtime_signal_observations.',
  };
}

export const __test__ = {
  normalizeTariffSnapshotRows,
  normalizeDemandSnapshotRows,
  mergeRows,
  weatherPressure,
};
