import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runPublicMarketCapture } from '../services/publicMarketCaptureService.js';

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

try {
  const args = parseArgs();
  const hotel = await findHotel(args);
  const result = await runPublicMarketCapture({
    hotelId: args.hotelId || hotel?.id || '',
    hotelName: args.hotelName || hotel?.hotel_name || 'The Ten Resort Siolim Goa',
    city: args.city || hotel?.city || 'Goa',
    slug: args.slug || 'the-ten',
    baseDir: args.baseDir || '',
    startDate: args.startDate || '',
    horizonDays: args.horizonDays || 15,
    latitude: args.latitude || hotel?.latitude || '',
    longitude: args.longitude || hotel?.longitude || '',
    tariffSnapshotFile: args.tariffSnapshotFile || '',
    demandSnapshotFile: args.demandSnapshotFile || args.travelSnapshotFile || '',
    includeHolidays: !parseBoolean(args.noHolidays, false),
    includeWeather: !parseBoolean(args.noWeather, false),
    allowUnproofedTariff: parseBoolean(args.allowUnproofedTariff, false),
    demandProofRequired: parseBoolean(args.demandProofRequired, false),
  });

  logger.info('public_market_capture_completed', {
    hotelId: hotel?.id || args.hotelId || '',
    hotelName: args.hotelName || hotel?.hotel_name || '',
    generatedRows: result.generatedRows,
    baseDir: result.baseDir,
  });
  console.log(JSON.stringify(result, null, 2));
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
