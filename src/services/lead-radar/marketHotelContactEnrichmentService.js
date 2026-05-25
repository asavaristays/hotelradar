import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  listMarketHotelsMissingContactFields,
  updateMarketHotelContactFields,
} from '../../repositories/marketHotelRepository.js';

const GOOGLE_PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const GOOGLE_PLACE_DETAILS_FIELDS = 'websiteUri,nationalPhoneNumber,googleMapsUri';

const defaultDeps = {
  listMarketHotelsMissingContactFields,
  updateMarketHotelContactFields,
  fetch: globalThis.fetch.bind(globalThis),
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPlaceContactDetails(
  placeId,
  apiKey,
  fetchImpl = defaultDeps.fetch,
) {
  const response = await fetchImpl(`${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': GOOGLE_PLACE_DETAILS_FIELDS,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Places Details returned HTTP ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return {
    website: payload.websiteUri || null,
    phone: payload.nationalPhoneNumber || null,
    googleMapsUrl: payload.googleMapsUri || null,
  };
}

export async function runMarketHotelContactEnrichment(options = {}, deps = defaultDeps) {
  const apiKey = String(options.apiKey || env.googleMapsApiKey || '').trim();

  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is required for market hotel contact enrichment.');
  }

  const batchSize = Math.max(1, Number(options.batchSize || 50));
  const delayMs = Math.max(0, Number(options.delayMs || 200));

  const hotels = await deps.listMarketHotelsMissingContactFields();

  logger.info('market_hotel_contact_enrichment_started', {
    startCount: hotels.length,
    batchSize,
    delayMs,
  });

  let processed = 0;
  let updatedRows = 0;
  let errors = 0;

  for (let index = 0; index < hotels.length; index += batchSize) {
    const batch = hotels.slice(index, index + batchSize);

    for (const hotel of batch) {
      processed += 1;

      try {
        const details = await fetchPlaceContactDetails(
          hotel.googlePlaceId,
          apiKey,
          deps.fetch,
        );

        const result = await deps.updateMarketHotelContactFields(hotel.id, details);
        updatedRows += Number(result?.rowCount || 0);
      } catch (error) {
        errors += 1;
        logger.error('market_hotel_contact_enrichment_row_failed', {
          hotelId: hotel.id,
          googlePlaceId: hotel.googlePlaceId,
          error: error?.message || String(error),
        });
      }

      logger.info('market_hotel_contact_enrichment_progress', {
        startCount: hotels.length,
        processed,
        updatedRows,
        errors,
      });

      await sleep(delayMs);
    }
  }

  const summary = {
    startCount: hotels.length,
    processed,
    updatedRows,
    errors,
  };

  logger.info('market_hotel_contact_enrichment_completed', summary);
  return summary;
}
