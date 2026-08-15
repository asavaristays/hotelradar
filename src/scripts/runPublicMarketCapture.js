import { pool } from '../db/pool.js';
import path from 'path';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { runPublicMarketCapture } from '../services/publicMarketCaptureService.js';
import { provisionVerifiedSourceFeedPack } from '../services/verifiedSourceFeedPackService.js';

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function cleanText(value = '') {
  return String(value || '').trim();
}

function slugify(value = '') {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'hotel';
}

function deriveSlugFromSourceUrl(sourceUrl = '', baseDir = '') {
  const raw = cleanText(sourceUrl);
  if (!raw) return '';
  try {
    const resolved = path.resolve(raw.startsWith('file://') ? new URL(raw).pathname : raw);
    const sourceBase = path.resolve(baseDir || env.publicMarketLiveSourcesDir);
    if (!resolved.startsWith(`${sourceBase}${path.sep}`)) return '';
    return path.basename(path.dirname(resolved));
  } catch {
    return '';
  }
}

async function findHotel(args) {
  if (parseBoolean(args.skipHotelLookup, false)) return null;
  if (!args.hotelId && !args.hotelName) return null;
  try {
    const values = [args.hotelId || null, args.hotelName || null, args.city || null];
    const { rows } = await pool.query(
      `SELECT h.id,
              h.hotel_name,
              COALESCE(c.name, h.city, $3, 'Goa') AS city,
              NULLIF(to_jsonb(h)->>'latitude', '')::numeric AS latitude,
              NULLIF(to_jsonb(h)->>'longitude', '')::numeric AS longitude
         FROM hotels h
         LEFT JOIN cities c ON c.id = h.city_id
        WHERE ($1::text IS NOT NULL AND h.id::text = $1::text)
           OR (
                $1::text IS NULL
            AND $2::text IS NOT NULL
            AND (
                  lower(h.hotel_name) = lower($2::text)
               OR lower(to_jsonb(h)->>'name') = lower($2::text)
               OR lower(h.hotel_name) LIKE lower('%' || $2::text || '%')
            )
          )
        ORDER BY h.created_at DESC NULLS LAST
        LIMIT 1`,
      values,
    );
    return rows[0] || null;
  } catch (error) {
    logger.warn('public_market_capture_hotel_lookup_skipped', {
      error: error?.message || String(error),
    });
    return null;
  }
}

async function listActiveHotelsForCapture(args) {
  const values = [Number(args.limit || 0) || null];
  const { rows } = await pool.query(
    `SELECT
       h.id,
       h.hotel_name,
       COALESCE(c.name, h.city, 'Goa') AS city,
       NULLIF(to_jsonb(h)->>'latitude', '')::numeric AS latitude,
       NULLIF(to_jsonb(h)->>'longitude', '')::numeric AS longitude,
       existing_source.source_url AS existing_source_url
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN LATERAL (
       SELECT s.source_url
       FROM verified_live_data_sources s
       WHERE s.hotel_id = h.id
         AND s.source_url IS NOT NULL
         AND s.metadata->>'feedPack' = 'verified-source-feed-pack-v1'
       ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
       LIMIT 1
     ) existing_source ON TRUE
     WHERE COALESCE(h.subscription_status, 'active') = 'active'
     ORDER BY h.hotel_name ASC
     LIMIT COALESCE($1::int, 100000)`,
    values,
  );
  return rows;
}

function captureOptionsForHotel({ args, hotel, slug, baseDir }) {
  const sourceDir = path.resolve(baseDir, slug);
  const tariffSnapshotFile = path.resolve(sourceDir, 'tariff-snapshot.json');
  const demandSnapshotFile = path.resolve(sourceDir, 'demand-snapshot.json');
  return {
    hotelId: hotel?.id || args.hotelId || '',
    hotelName: args.hotelName || hotel?.hotel_name || 'The Ten Resort Siolim Goa',
    city: args.city || hotel?.city || 'Goa',
    slug,
    baseDir,
    startDate: args.startDate || '',
    horizonDays: args.horizonDays || 15,
    latitude: args.latitude || hotel?.latitude || '',
    longitude: args.longitude || hotel?.longitude || '',
    tariffSnapshotFile: args.tariffSnapshotFile || tariffSnapshotFile,
    demandSnapshotFile: args.demandSnapshotFile || args.travelSnapshotFile || demandSnapshotFile,
    includeHolidays: !parseBoolean(args.noHolidays, false),
    includeWeather: !parseBoolean(args.noWeather, false),
    allowUnproofedTariff: parseBoolean(args.allowUnproofedTariff, false),
    demandProofRequired: parseBoolean(args.demandProofRequired, false),
  };
}

try {
  const args = parseArgs();
  const baseDir = args.baseDir || env.publicMarketLiveSourcesDir;

  if (parseBoolean(args.allHotels, false)) {
    const hotels = await listActiveHotelsForCapture(args);
    const results = [];
    for (const hotel of hotels) {
      const slug = deriveSlugFromSourceUrl(hotel.existing_source_url, baseDir) || slugify(hotel.hotel_name);
      await provisionVerifiedSourceFeedPack({
        hotelId: hotel.id,
        city: hotel.city,
        slug,
        baseDir,
      });
      const result = await runPublicMarketCapture(captureOptionsForHotel({ args, hotel, slug, baseDir }));
      results.push({
        hotelId: hotel.id,
        hotelName: hotel.hotel_name,
        city: hotel.city,
        slug,
        generatedRows: result.generatedRows,
        rejectedRows: result.rejectedRows.length,
        sourceResults: result.sourceResults,
        baseDir: result.baseDir,
      });
      logger.info('public_market_capture_hotel_completed', {
        hotelId: hotel.id,
        hotelName: hotel.hotel_name,
        slug,
        generatedRows: result.generatedRows,
      });
    }

    const payload = {
      status: 'ok',
      mode: 'all_hotels',
      hotelsProcessed: results.length,
      generatedRows: results.reduce((sum, row) => sum + Number(row.generatedRows || 0), 0),
      rejectedRows: results.reduce((sum, row) => sum + Number(row.rejectedRows || 0), 0),
      results,
      nextStep: 'Run npm run ingestion:realtime-signals -- --force-sources once after the batch.',
    };
    logger.info('public_market_capture_all_hotels_completed', {
      hotelsProcessed: payload.hotelsProcessed,
      generatedRows: payload.generatedRows,
    });
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const hotel = await findHotel(args);
    const slug = args.slug
      || deriveSlugFromSourceUrl(hotel?.existing_source_url, baseDir)
      || 'the-ten';
    const result = await runPublicMarketCapture(captureOptionsForHotel({ args, hotel, slug, baseDir }));

    logger.info('public_market_capture_completed', {
      hotelId: hotel?.id || args.hotelId || '',
      hotelName: args.hotelName || hotel?.hotel_name || '',
      generatedRows: result.generatedRows,
      baseDir: result.baseDir,
    });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  logger.error('public_market_capture_failed', {
    error: error?.message || String(error),
    stack: error?.stack,
  });
  console.error(JSON.stringify({ status: 'failed', error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
