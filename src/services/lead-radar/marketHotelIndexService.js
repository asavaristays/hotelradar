import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import { isVisibleHotelRecord } from '../../utils/hotelVisibility.js';
import {
  deleteMarketHotelsMissingPlaceIdByCity,
  getMarketHotelCountsByCity,
  upsertMarketHotels,
} from '../../repositories/marketHotelRepository.js';

const GOOGLE_PLACES_NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const DEFAULT_RETRIES = 3;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; HotelRADAR Market Hotel Index; +https://hotelradar.in)';
const METERS_PER_LATITUDE_DEGREE = 111_320;
const CITY_GRID_CONFIG = {
  Delhi: {
    minLatitude: 28.40,
    maxLatitude: 28.88,
    minLongitude: 76.84,
    maxLongitude: 77.35,
  },
  Goa: {
    minLatitude: 14.85,
    maxLatitude: 15.85,
    minLongitude: 73.70,
    maxLongitude: 74.25,
  },
  Gurugram: {
    minLatitude: 28.34,
    maxLatitude: 28.56,
    minLongitude: 76.94,
    maxLongitude: 77.17,
  },
  Jaipur: {
    minLatitude: 26.75,
    maxLatitude: 27.05,
    minLongitude: 75.65,
    maxLongitude: 76.00,
  },
  Mumbai: {
    minLatitude: 18.88,
    maxLatitude: 19.32,
    minLongitude: 72.77,
    maxLongitude: 72.99,
  },
};

const defaultDeps = {
  deleteMarketHotelsMissingPlaceIdByCity,
  getMarketHotelCountsByCity,
  upsertMarketHotels,
  fetchImpl: globalThis.fetch,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeMarketHotelName(value = '', city = '') {
  let normalized = normalizeWhitespace(value);
  if (!normalized) return '';

  const cityPattern = escapeRegExp(normalizeWhitespace(city));
  if (cityPattern) {
    normalized = normalized
      .replace(new RegExp(`\\s*[-,|]\\s*${cityPattern}$`, 'i'), '')
      .replace(new RegExp(`\\s+${cityPattern}$`, 'i'), '')
      .trim();
  }

  return normalized;
}

function normalizeTextKey(value = '') {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toLongitudeStepDegrees(stepMeters, latitude) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const metersPerLongitudeDegree = Math.max(
    1,
    METERS_PER_LATITUDE_DEGREE * Math.cos(latitudeRadians),
  );
  return stepMeters / metersPerLongitudeDegree;
}

export function buildNearbySearchGrid(
  city,
  {
    radiusMeters = env.marketHotelGridRadiusMeters,
    stepMeters = env.marketHotelGridStepMeters,
  } = {},
) {
  const config = CITY_GRID_CONFIG[city];
  if (!config) {
    const error = new Error(`No nearby-search grid configured for ${city}.`);
    error.status = 400;
    throw error;
  }

  const latitudeStep = stepMeters / METERS_PER_LATITUDE_DEGREE;
  const cells = [];

  for (let latitude = config.minLatitude; latitude <= config.maxLatitude; latitude += latitudeStep) {
    const longitudeStep = toLongitudeStepDegrees(stepMeters, latitude);

    for (
      let longitude = config.minLongitude;
      longitude <= config.maxLongitude;
      longitude += longitudeStep
    ) {
      cells.push({
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        radiusMeters,
      });
    }
  }

  return cells;
}

export function normalizeGooglePlaceResult(place = {}, { city, source } = {}) {
  const displayName =
    typeof place?.displayName?.text === 'string' ? place.displayName.text : place?.name;
  const hotelName = normalizeMarketHotelName(displayName, city);
  const latitude = toFiniteNumber(place?.location?.latitude ?? place?.geometry?.location?.lat);
  const longitude = toFiniteNumber(place?.location?.longitude ?? place?.geometry?.location?.lng);
  const googlePlaceId = String(place?.id || '').trim() || null;

  if (!hotelName || latitude === null || longitude === null || !googlePlaceId) {
    return null;
  }

  const googleRating = toFiniteNumber(place?.rating);
  const reviewCount = toFiniteNumber(place?.userRatingCount ?? place?.user_ratings_total);

  return {
    googlePlaceId,
    hotelName,
    city,
    latitude,
    longitude,
    googleRating: googleRating === null ? null : Math.max(0, Math.min(5, googleRating)),
    reviewCount: reviewCount === null ? null : Math.max(0, Math.round(reviewCount)),
    source,
  };
}

function dedupeMarketHotels(rows = []) {
  const deduped = new Map();

  for (const row of rows.filter((entry) => isVisibleHotelRecord(entry))) {
    const key = row.googlePlaceId || `${normalizeTextKey(row.hotelName)}|${normalizeTextKey(row.city)}`;
    if (!key) continue;

    const existing = deduped.get(key);
    if (!existing || Number(row.reviewCount || 0) > Number(existing.reviewCount || 0)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
}

async function fetchNearbySearchPage({
  apiKey,
  center,
  fetchImpl = globalThis.fetch,
  timeoutMs = env.marketHotelCollectTimeoutMs,
  minDelayMs = env.marketHotelCollectMinDelayMs,
  retries = DEFAULT_RETRIES,
  pageSize = env.marketHotelNearbyResultCount,
  radiusMeters = env.marketHotelGridRadiusMeters,
} = {}) {
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is required for market hotel indexing.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available');
  }

  const requestBody = {
    includedTypes: ['lodging'],
    maxResultCount: pageSize,
    rankPreference: 'DISTANCE',
    locationRestriction: {
      circle: {
        center: {
          latitude: center.latitude,
          longitude: center.longitude,
        },
        radius: radiusMeters,
      },
    },
  };

  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      if (attempt > 0 || minDelayMs > 0) {
        await sleep(Math.max(0, minDelayMs));
      }

      const response = await fetchImpl(GOOGLE_PLACES_NEARBY_SEARCH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': DEFAULT_USER_AGENT,
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Google Places returned HTTP ${response.status}`);
      }

      const responseBody = await response.json();
      const status = String(responseBody?.status || 'OK').trim();

      if (!['OK', 'ZERO_RESULTS'].includes(status)) {
        throw new Error(
          `Google Places returned ${status}${responseBody?.error_message ? `: ${responseBody.error_message}` : ''}`,
        );
      }

      return {
        results: Array.isArray(responseBody?.places) ? responseBody.places : [],
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep((attempt + 1) * 500);
      }
    }
  }

  throw lastError || new Error('Unable to fetch Google Places nearby search results');
}

export async function collectGoogleMarketHotels({
  city = 'Goa',
  query = `hotels in ${city}`,
  apiKey = env.googleMapsApiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = env.marketHotelCollectTimeoutMs,
  minDelayMs = env.marketHotelCollectMinDelayMs,
  retries = DEFAULT_RETRIES,
  pageSize = env.marketHotelNearbyResultCount,
  radiusMeters = env.marketHotelGridRadiusMeters,
  stepMeters = env.marketHotelGridStepMeters,
} = {}) {
  assertCityInScope(city, 'city');

  const source = `google-maps-nearby-grid:${query}`;
  const normalizedRows = [];
  const cells = buildNearbySearchGrid(city, { radiusMeters, stepMeters });
  let pagesFetched = 0;
  let rawResults = 0;
  let skippedMissingCoordinates = 0;

  for (const center of cells) {
    const page = await fetchNearbySearchPage({
      apiKey,
      center,
      fetchImpl,
      timeoutMs,
      minDelayMs,
      retries,
      pageSize,
      radiusMeters,
    });

    pagesFetched += 1;
    rawResults += page.results.length;

    for (const place of page.results) {
      const normalized = normalizeGooglePlaceResult(place, { city, source });
      if (!normalized) {
        skippedMissingCoordinates += 1;
        continue;
      }
      normalizedRows.push(normalized);
    }
  }

  return {
    city,
    query,
    source,
    gridCellCount: cells.length,
    pagesFetched,
    rawResults,
    skippedMissingCoordinates,
    hotels: dedupeMarketHotels(normalizedRows),
  };
}

export async function runMarketHotelIndex(options = {}, deps = defaultDeps) {
  const city = String(options.city || 'Goa').trim() || 'Goa';
  const batchSize = Math.max(1, Number(options.batchSize || env.marketHotelBatchSize || 50));
  const startedAt = Date.now();

  logger.info('market_hotel_index_started', {
    city,
    batchSize,
  });

  const collected = await collectGoogleMarketHotels({
    city,
    query: options.query || `hotels in ${city}`,
    apiKey: options.apiKey || env.googleMapsApiKey,
    fetchImpl: deps.fetchImpl,
    timeoutMs: options.timeoutMs || env.marketHotelCollectTimeoutMs,
    minDelayMs: options.minDelayMs ?? env.marketHotelCollectMinDelayMs,
    retries: options.retries || DEFAULT_RETRIES,
    pageSize: options.pageSize || env.marketHotelNearbyResultCount,
    radiusMeters: options.radiusMeters || env.marketHotelGridRadiusMeters,
    stepMeters: options.stepMeters || env.marketHotelGridStepMeters,
  });

  const cleaned = await deps.deleteMarketHotelsMissingPlaceIdByCity(city);
  const upserted = await deps.upsertMarketHotels(collected.hotels, { batchSize });
  const counts = await deps.getMarketHotelCountsByCity(city);
  const summary = {
    city,
    query: collected.query,
    source: collected.source,
    gridCellCount: collected.gridCellCount,
    rawResults: collected.rawResults,
    pagesFetched: collected.pagesFetched,
    skippedMissingCoordinates: collected.skippedMissingCoordinates,
    totalHotelsCollected: collected.hotels.length,
    cleanedLegacyRows: Number(cleaned?.rowCount || 0),
    rowsUpserted: Number(upserted?.rowCount || 0),
    finalStoredHotels: Number(counts?.totalHotels || 0),
    finalStoredWithPlaceId: Number(counts?.withPlaceId || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_index_completed', summary);
  return summary;
}
