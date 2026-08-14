import fs from 'fs/promises';
import path from 'path';
import { pool } from '../db/pool.js';
import { upsertVerifiedLiveDataSource } from '../repositories/verifiedLiveDataSourceRepository.js';

const DEFAULT_HOTEL_NAME = 'The Ten Resort Siolim Goa';
const DEFAULT_CITY = 'Goa';
const DEFAULT_SLUG = 'the-ten';

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

function defaultBaseDir() {
  return path.resolve(process.cwd(), 'shared/live_sources');
}

function manifestPath(baseDir, slug, fileName) {
  return path.resolve(baseDir, slug, fileName);
}

function buildManifest({ title, sourceType, adapterType, description, templateRows = [] }) {
  return {
    schema_version: 'hotelradar-verified-live-source-v1',
    title,
    source_type: sourceType,
    adapter_type: adapterType,
    description,
    rows: [],
    template_rows: templateRows,
    notes: [
      'Keep rows empty until evidence is actually captured.',
      'Never enter zero for missing rates. Leave rate fields absent until captured.',
      'Use proof_url for rate evidence whenever possible.',
      'observed_at should be an ISO timestamp from the actual capture time.',
    ],
  };
}

export function buildVerifiedSourceFeedPackDefinitions({
  hotelId,
  hotelName = DEFAULT_HOTEL_NAME,
  city = DEFAULT_CITY,
  baseDir = defaultBaseDir(),
  slug = DEFAULT_SLUG,
} = {}) {
  const safeHotelName = cleanText(hotelName) || DEFAULT_HOTEL_NAME;
  const safeCity = cleanText(city) || DEFAULT_CITY;
  const safeSlug = slugify(slug || safeHotelName);
  const sourceBase = path.resolve(baseDir, safeSlug);

  return [
    {
      key: 'official',
      fileName: 'official-rates.json',
      sourceType: 'official',
      sourceName: `${safeHotelName} official booking engine`,
      adapterType: 'official_rate_manifest',
      proofRequired: true,
      freshnessMinutes: 240,
      cadenceMinutes: 60,
      sourceUrl: manifestPath(baseDir, safeSlug, 'official-rates.json'),
      manifest: buildManifest({
        title: `${safeHotelName} official booking engine`,
        sourceType: 'official',
        adapterType: 'official_rate_manifest',
        description: 'Direct booking engine / brand website rate evidence for the next 15 stay dates.',
        templateRows: [
          {
            hotel_id: hotelId || '<hotel_uuid>',
            hotel_name: safeHotelName,
            city: safeCity,
            checkin_date: 'YYYY-MM-DD',
            source_type: 'official',
            source_name: `${safeHotelName} official booking engine`,
            signal_type: 'hotel_rate',
            rate: '<positive_rate_only>',
            currency: 'INR',
            proof_url: 'https://booking-engine.example/rate-proof',
            observed_at: 'YYYY-MM-DDTHH:mm:ss.sssZ',
          },
        ],
      }),
    },
    {
      key: 'ota',
      fileName: 'ota-rates.json',
      sourceType: 'ota',
      sourceName: `${safeHotelName} OTA proof panel`,
      adapterType: 'google_hotels_manifest',
      proofRequired: true,
      freshnessMinutes: 120,
      cadenceMinutes: 60,
      sourceUrl: manifestPath(baseDir, safeSlug, 'ota-rates.json'),
      manifest: buildManifest({
        title: `${safeHotelName} OTA proof panel`,
        sourceType: 'ota',
        adapterType: 'google_hotels_manifest',
        description: 'Google Hotels / Agoda / Booking.com / Expedia / MMT rate evidence with proof URL.',
        templateRows: [
          {
            hotel_id: hotelId || '<hotel_uuid>',
            hotel_name: safeHotelName,
            city: safeCity,
            checkin_date: 'YYYY-MM-DD',
            source_type: 'ota',
            source_name: 'Google Hotels',
            signal_type: 'ota_rate',
            rate: '<positive_rate_only>',
            currency: 'INR',
            proof_url: 'https://www.google.com/travel/hotels/...',
            observed_at: 'YYYY-MM-DDTHH:mm:ss.sssZ',
            metadata: {
              channel: 'Google Hotels',
              occupancy: 2,
              room_basis: 'base comparable room',
            },
          },
        ],
      }),
    },
    {
      key: 'competitor',
      fileName: 'competitor-rates.json',
      sourceType: 'competitor',
      sourceName: `${safeHotelName} competitor comp-set proof`,
      adapterType: 'json_manifest',
      proofRequired: true,
      freshnessMinutes: 120,
      cadenceMinutes: 60,
      sourceUrl: manifestPath(baseDir, safeSlug, 'competitor-rates.json'),
      manifest: buildManifest({
        title: `${safeHotelName} competitor comp-set proof`,
        sourceType: 'competitor',
        adapterType: 'json_manifest',
        description: 'Comparable competitor rates for the same stay date, length of stay, occupancy, and room basis.',
        templateRows: [
          {
            hotel_id: hotelId || '<hotel_uuid>',
            hotel_name: safeHotelName,
            city: safeCity,
            checkin_date: 'YYYY-MM-DD',
            source_type: 'competitor',
            source_name: '<competitor_hotel_name>',
            signal_type: 'competitor_rate',
            rate: '<positive_rate_only>',
            currency: 'INR',
            proof_url: 'https://www.google.com/travel/hotels/...',
            observed_at: 'YYYY-MM-DDTHH:mm:ss.sssZ',
            metadata: {
              competitor_name: '<competitor_hotel_name>',
              occupancy: 2,
              room_basis: 'base comparable room',
            },
          },
        ],
      }),
    },
    {
      key: 'demand',
      fileName: 'demand-signals.json',
      sourceType: 'event',
      sourceName: `${safeHotelName} demand pressure signals`,
      adapterType: 'json_manifest',
      proofRequired: false,
      freshnessMinutes: 720,
      cadenceMinutes: 360,
      sourceUrl: manifestPath(baseDir, safeSlug, 'demand-signals.json'),
      manifest: buildManifest({
        title: `${safeHotelName} demand pressure signals`,
        sourceType: 'event',
        adapterType: 'json_manifest',
        description: 'Holiday, event, MICE, wedding, travel/search, airfare, and local pressure observations.',
        templateRows: [
          {
            hotel_id: hotelId || '<hotel_uuid>',
            hotel_name: safeHotelName,
            city: safeCity,
            checkin_date: 'YYYY-MM-DD',
            source_type: 'event',
            source_name: 'Market calendar',
            signal_type: 'event_signal',
            value_text: 'Independence Day long weekend demand pressure',
            value_numeric: 80,
            proof_url: 'https://example.com/source-proof',
            observed_at: 'YYYY-MM-DDTHH:mm:ss.sssZ',
            metadata: {
              category: 'holiday',
              confidence: 'high',
            },
          },
          {
            hotel_id: hotelId || '<hotel_uuid>',
            hotel_name: safeHotelName,
            city: safeCity,
            checkin_date: 'YYYY-MM-DD',
            source_type: 'search',
            source_name: 'Google Trends / search intent',
            signal_type: 'search_trend',
            value_text: 'Goa hotel search intent rising',
            value_numeric: 65,
            proof_url: 'https://trends.google.com/...',
            observed_at: 'YYYY-MM-DDTHH:mm:ss.sssZ',
          },
        ],
      }),
    },
    {
      key: 'pms',
      fileName: 'pms-pickup.json',
      sourceType: 'pms',
      sourceName: `${safeHotelName} PMS pickup and pace`,
      adapterType: 'pms_manifest',
      proofRequired: false,
      freshnessMinutes: 120,
      cadenceMinutes: 60,
      sourceUrl: manifestPath(baseDir, safeSlug, 'pms-pickup.json'),
      manifest: buildManifest({
        title: `${safeHotelName} PMS pickup and pace`,
        sourceType: 'pms',
        adapterType: 'pms_manifest',
        description: 'Internal hotel pickup, occupancy, cancellation, booking pace, and lead-time signal.',
        templateRows: [
          {
            hotel_id: hotelId || '<hotel_uuid>',
            hotel_name: safeHotelName,
            city: safeCity,
            checkin_date: 'YYYY-MM-DD',
            source_type: 'pms',
            source_name: `${safeHotelName} PMS`,
            signal_type: 'pms_pickup',
            value_numeric: 42,
            value_text: '42% occupancy on books; pickup +3 rooms in 24h',
            observed_at: 'YYYY-MM-DDTHH:mm:ss.sssZ',
            metadata: {
              occupancy_on_books_pct: 42,
              pickup_rooms_24h: 3,
              cancellation_pct: 4,
              avg_lead_time_days: 18,
            },
          },
        ],
      }),
    },
  ].map((definition) => ({
    ...definition,
    hotelId: hotelId || null,
    hotelName: safeHotelName,
    city: safeCity,
    slug: safeSlug,
    sourceBase,
  }));
}

async function writeManifestIfNeeded(filePath, manifest, { overwrite = false, deps } = {}) {
  try {
    await deps.mkdir(path.dirname(filePath), { recursive: true });
    if (!overwrite) {
      await deps.access(filePath);
      return { filePath, created: false, overwritten: false };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await deps.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { filePath, created: !overwrite, overwritten: Boolean(overwrite) };
}

async function findHotel({ hotelId = '', hotelName = DEFAULT_HOTEL_NAME, city = DEFAULT_CITY } = {}, deps = {}) {
  if (hotelId) {
    const { rows } = await deps.query(
      `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city, $2) AS city
       FROM hotels h
       LEFT JOIN cities c ON c.id = h.city_id
       WHERE h.id::text = $1
       LIMIT 1`,
      [hotelId, city],
    );
    return rows[0] || null;
  }

  const { rows } = await deps.query(
    `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city, $2) AS city
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE (
       lower(h.hotel_name) = lower($1)
       OR lower(h.name) = lower($1)
       OR lower(h.hotel_name) LIKE lower($3)
       OR lower(h.name) LIKE lower($3)
     )
       AND lower(COALESCE(c.name, h.city, $2)) = lower($2)
     ORDER BY
       CASE WHEN lower(h.hotel_name) = lower($1) THEN 0 ELSE 1 END,
       h.created_at DESC NULLS LAST
     LIMIT 1`,
    [hotelName, city, `%${hotelName}%`],
  );
  return rows[0] || null;
}

const defaultDeps = {
  query: (...args) => pool.query(...args),
  mkdir: (...args) => fs.mkdir(...args),
  access: (...args) => fs.access(...args),
  writeFile: (...args) => fs.writeFile(...args),
  upsertVerifiedLiveDataSource,
};

export async function provisionVerifiedSourceFeedPack(options = {}, deps = defaultDeps) {
  const hotel = await findHotel(options, deps);
  if (!hotel?.id) {
    throw new Error(
      `Hotel not found for feed pack provisioning. hotelId=${options.hotelId || ''} hotelName=${options.hotelName || DEFAULT_HOTEL_NAME} city=${options.city || DEFAULT_CITY}`,
    );
  }

  const baseDir = options.baseDir || defaultBaseDir();
  const slug = slugify(options.slug || hotel.hotel_name || DEFAULT_SLUG);
  const definitions = buildVerifiedSourceFeedPackDefinitions({
    hotelId: hotel.id,
    hotelName: hotel.hotel_name,
    city: hotel.city || options.city || DEFAULT_CITY,
    baseDir,
    slug,
  });

  const files = [];
  const sources = [];
  for (const definition of definitions) {
    files.push(await writeManifestIfNeeded(definition.sourceUrl, definition.manifest, {
      overwrite: Boolean(options.overwrite),
      deps,
    }));
    const source = await deps.upsertVerifiedLiveDataSource({
      hotelId: hotel.id,
      city: definition.city,
      sourceType: definition.sourceType,
      sourceName: definition.sourceName,
      adapterType: definition.adapterType,
      sourceUrl: definition.sourceUrl,
      enabled: true,
      cadenceMinutes: definition.cadenceMinutes,
      proofRequired: definition.proofRequired,
      freshnessMinutes: definition.freshnessMinutes,
      metadata: {
        feedPack: 'verified-source-feed-pack-v1',
        feedKey: definition.key,
        manifestFile: definition.fileName,
        provisionedBy: 'provisionVerifiedSourceFeedPack',
      },
    });
    sources.push(source);
  }

  return {
    hotel,
    baseDir: path.resolve(baseDir, slug),
    files,
    sources,
  };
}
