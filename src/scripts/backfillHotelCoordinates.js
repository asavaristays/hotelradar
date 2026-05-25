import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { focusCityKeys } from '../config/productScope.js';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const REQUEST_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;
const QUERY_VARIANT_LIMIT = 4;

const HOTEL_QUERY_OVERRIDES = {
  'bkc business hotel|mumbai': [
    'BKC Mumbai, India',
    'Bandra Kurla Complex Mumbai, India',
  ],
  'hibis hotels and resorts - ashwem, goa|goa': [
    'Ashwem Goa, India',
    'Ashwem Beach Goa, India',
  ],
  'hibis hotels and resorts - morjim, goa|goa': [
    'Morjim Goa, India',
    'Morjim Beach Goa, India',
  ],
  'marine drive grand|mumbai': [
    'Marine Drive Mumbai, India',
    'Marine Drive hotel Mumbai, India',
  ],
  'royal heritage haveli|jaipur': [
    'Royal Heritage Haveli Jaipur, India',
  ],
  'seabreeze candolim|goa': [
    'Candolim Goa, India',
    'Seabreeze Candolim Goa, India',
  ],
  'the acacia morjim goa|goa': [
    'The Acacia Morjim Goa, India',
    'Morjim Goa, India',
  ],
  'hotel taj goa|goa': [
    'Taj Goa, India',
    'Taj Hotel Goa, India',
  ],
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildQuery(hotel) {
  return [hotel?.hotel_name, hotel?.city].filter(Boolean).join(', ');
}

function normalizeName(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildQueryVariants(hotel) {
  const hotelName = String(hotel?.hotel_name || '').trim();
  const city = String(hotel?.city || '').trim();
  const baseKey = `${normalizeName(hotelName)}|${normalizeName(city)}`;
  const overrideQueries = HOTEL_QUERY_OVERRIDES[baseKey] || [];
  const cleanedHotelName = hotelName
    .replace(/\s*-\s*[^,]+,\s*goa$/i, '')
    .replace(/\s*,\s*goa$/i, '')
    .trim();

  const queries = [
    `${hotelName}, ${city}, India`,
    `${cleanedHotelName}, ${city}, India`,
    `${hotelName}, India`,
    ...overrideQueries,
  ];

  return Array.from(new Set(
    queries
      .map((entry) => String(entry || '').trim())
      .filter(Boolean),
  )).slice(0, QUERY_VARIANT_LIMIT);
}

async function fetchCoordinates(query, attempt = 1) {
  const url = new URL(NOMINATIM_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HotelRADAR/0.2.0 (hotel coordinate backfill)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const payload = await response.json();
    const row = Array.isArray(payload) ? payload[0] : null;
    if (!row) {
      return null;
    }

    const latitude = Number(row.lat);
    const longitude = Number(row.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await sleep(REQUEST_DELAY_MS * attempt);
    return fetchCoordinates(query, attempt + 1);
  }
}

async function resolveCoordinates(hotel) {
  const queryVariants = buildQueryVariants(hotel);

  for (const query of queryVariants) {
    const coordinates = await fetchCoordinates(query);
    if (coordinates) {
      return { coordinates, query };
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { coordinates: null, query: queryVariants[0] || buildQuery(hotel) };
}

async function listHotelsMissingCoordinates() {
  const { rows } = await pool.query(
    `SELECT id, hotel_name, city
     FROM hotels
     WHERE latitude IS NULL OR longitude IS NULL
       AND LOWER(city) = ANY($1::text[])
     ORDER BY hotel_name ASC`,
    [focusCityKeys],
  );
  return rows;
}

async function updateHotelCoordinates(hotelId, latitude, longitude) {
  await pool.query(
    `UPDATE hotels
     SET latitude = $2,
         longitude = $3
     WHERE id = $1
       AND (latitude IS NULL OR longitude IS NULL)`,
    [hotelId, latitude, longitude],
  );
}

async function main() {
  const hotels = await listHotelsMissingCoordinates();

  logger.info('hotel_coordinates_backfill_started', {
    pendingHotels: hotels.length,
  });

  let successCount = 0;
  let skippedCount = 0;
  let failureCount = 0;

  for (const hotel of hotels) {
    try {
      const { coordinates, query } = await resolveCoordinates(hotel);

      if (!coordinates) {
        skippedCount += 1;
        logger.warn('hotel_coordinates_backfill_skipped', {
          hotelId: hotel.id,
          hotelName: hotel.hotel_name,
          city: hotel.city,
          query,
          reason: 'no_geocode_result',
        });
      } else {
        await updateHotelCoordinates(hotel.id, coordinates.latitude, coordinates.longitude);
        successCount += 1;
        logger.info('hotel_coordinates_backfill_updated', {
          hotelId: hotel.id,
          hotelName: hotel.hotel_name,
          city: hotel.city,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        });
      }
    } catch (error) {
      failureCount += 1;
      logger.error('hotel_coordinates_backfill_failed', {
        hotelId: hotel.id,
        hotelName: hotel.hotel_name,
        city: hotel.city,
        query: buildQuery(hotel),
        error: error?.message || String(error),
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  logger.info('hotel_coordinates_backfill_completed', {
    pendingHotels: hotels.length,
    successCount,
    skippedCount,
    failureCount,
  });
}

main()
  .catch((error) => {
    logger.error('hotel_coordinates_backfill_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
