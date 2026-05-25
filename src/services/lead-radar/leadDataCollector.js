import * as hotelRepository from '../../repositories/hotelRepository.js';
import * as hotelEnrichmentRepository from '../../repositories/hotelEnrichmentRepository.js';

/**
 * Collect raw hotel and market context for LeadRADAR. This module should stay
 * focused on gathering data from repositories and existing intelligence
 * services rather than scoring or request parsing.
 */

function normalizeFilters(filters = {}) {
  const city = typeof filters?.city === 'string' && filters.city.trim()
    ? filters.city.trim()
    : null;
  const limit = Number.isInteger(Number(filters?.limit)) && Number(filters.limit) > 0
    ? Number(filters.limit)
    : null;

  return {
    city,
    limit,
  };
}

function normalizeCoordinate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mergeHotelAndEnrichment(hotel, enrichment) {
  return {
    hotelId: hotel?.id || hotel?.hotelId || null,
    hotelName: hotel?.hotel_name || hotel?.hotelName || null,
    city: hotel?.city || null,
    latitude: normalizeCoordinate(hotel?.latitude ?? hotel?.lat),
    longitude: normalizeCoordinate(hotel?.longitude ?? hotel?.lng),
    subscriptionStatus: hotel?.subscription_status || hotel?.subscriptionStatus || null,
    rating: enrichment?.public_rating ?? null,
    reviewCount: enrichment?.review_count ?? null,
    hasChatbot: enrichment?.has_chatbot ?? null,
    chatbotProvider: enrichment?.chatbot_provider ?? null,
    otaChannels: enrichment?.ota_channels ?? null,
  };
}

async function loadEnrichmentMap(hotels = []) {
  const hotelIds = hotels
    .map((hotel) => hotel?.id || hotel?.hotelId || null)
    .filter((hotelId) => typeof hotelId === 'string' && hotelId.trim());

  if (!hotelIds.length) return new Map();

  if (typeof hotelEnrichmentRepository.listHotelEnrichmentByHotelIds === 'function') {
    const rows = await hotelEnrichmentRepository.listHotelEnrichmentByHotelIds(hotelIds);
    return new Map(rows.map((row) => [row.hotel_id, row]));
  }

  const rows = await Promise.all(
    hotelIds.map((hotelId) => hotelEnrichmentRepository.getHotelEnrichmentByHotelId(hotelId)),
  );

  return new Map(
    rows
      .filter(Boolean)
      .map((row) => [row.hotel_id, row]),
  );
}

export async function collectHotels(filters = {}) {
  const normalizedFilters = normalizeFilters(filters);
  const hotels = normalizedFilters.city && typeof hotelRepository.listHotelsByCity === 'function'
    ? await hotelRepository.listHotelsByCity(normalizedFilters.city)
    : await hotelRepository.listHotels();
  const scopedHotels = hotels.filter((hotel) => {
    if (
      normalizedFilters.city &&
      hotel.city?.toLowerCase() !== normalizedFilters.city?.toLowerCase()
    ) {
      return false;
    }
    return true;
  });
  const limitedHotels = normalizedFilters.limit
    ? scopedHotels.slice(0, normalizedFilters.limit)
    : scopedHotels;
  const enrichmentMap = await loadEnrichmentMap(limitedHotels);

  return limitedHotels.map((hotel) => mergeHotelAndEnrichment(
    hotel,
    enrichmentMap.get(hotel.id) || null,
  ));
}

export async function collectHotelContext(filters = {}) {
  if (typeof filters === 'string') {
    const hotel = await hotelRepository.getHotelById(filters);
    if (!hotel) return null;

    const enrichment = await hotelEnrichmentRepository.getHotelEnrichmentByHotelId(hotel.id);
    return mergeHotelAndEnrichment(hotel, enrichment);
  }

  return collectHotels(filters);
}
