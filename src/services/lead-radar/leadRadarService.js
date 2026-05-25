import { interpretPrompt, normalizeLeadFilters } from './leadQueryInterpreter.js';
import { computeLeadSignals } from './leadSignalEngine.js';
import { collectHotelContext } from './leadDataCollector.js';
import { computeSegmentOpportunities } from './segmentOpportunityEngine.js';

/**
 * Main LeadRADAR orchestration service.
 *
 * LeadRADAR must read from existing hotels and intelligence context only.
 * It should not create or mutate hotel entities.
 */

export async function runPromptQuery(prompt, filters = {}) {
  const promptFilters = await interpretPrompt(prompt, filters);
  const mergedFilters = await normalizeLeadFilters({
    ...filters,
    ...promptFilters,
  });
  const hotels = await collectHotelContext(mergedFilters);
  const scoredHotels = await computeLeadSignals(hotels);
  const segmentHotels = await computeSegmentOpportunities(scoredHotels);
  const limitedHotels = mergedFilters.limit ? segmentHotels.slice(0, mergedFilters.limit) : segmentHotels;

  return {
    hotels: limitedHotels.map((hotel) => ({
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      city: hotel.city,
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
      leadScore: hotel.leadScore,
      signals: hotel.signals,
      opportunities: hotel.opportunities,
      context: hotel.context,
      segmentOpportunities: hotel.segmentOpportunities,
    })),
    total: segmentHotels.length,
  };
}

export async function getHotels(filters = {}) {
  const normalizedFilters = await normalizeLeadFilters(filters);
  const hotels = await collectHotelContext(normalizedFilters);
  const scoredHotels = await computeLeadSignals(hotels);
  const segmentHotels = await computeSegmentOpportunities(scoredHotels);
  const limitedHotels = normalizedFilters.limit ? segmentHotels.slice(0, normalizedFilters.limit) : segmentHotels;

  return {
    hotels: limitedHotels.map((hotel) => ({
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      city: hotel.city,
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
      leadScore: hotel.leadScore,
      signals: hotel.signals,
      opportunities: hotel.opportunities,
      context: hotel.context,
      segmentOpportunities: hotel.segmentOpportunities,
    })),
    total: segmentHotels.length,
  };
}

export async function getOpportunities(filters = {}) {
  const normalizedFilters = await normalizeLeadFilters(filters);
  const hotels = await collectHotelContext(normalizedFilters);
  const scoredHotels = await computeLeadSignals(hotels);
  const segmentHotels = await computeSegmentOpportunities(scoredHotels);
  const filteredHotels = segmentHotels.filter((hotel) => {
    if (
      normalizedFilters.minLeadScore !== undefined &&
      Number(hotel?.leadScore || 0) < Number(normalizedFilters.minLeadScore)
    ) {
      return false;
    }
    return true;
  });
  const limitedHotels = normalizedFilters.limit
    ? filteredHotels.slice(0, normalizedFilters.limit)
    : filteredHotels;

  return {
    opportunities: limitedHotels.map((hotel) => ({
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      city: hotel.city,
      leadScore: hotel.leadScore,
      opportunity: hotel.opportunities?.[0]?.opportunity || null,
      action: hotel.opportunities?.[0]?.action || null,
    })),
  };
}

export async function getSummary(filters = {}) {
  const normalizedFilters = await normalizeLeadFilters({
    city: filters?.city,
    limit: 100,
  });
  const hotels = await collectHotelContext(normalizedFilters);
  const scoredHotels = await computeLeadSignals(hotels);
  const segmentHotels = await computeSegmentOpportunities(scoredHotels);

  let hotelsWithoutChatbot = 0;
  let hotelsLowRating = 0;
  let hotelsHighReviewVolume = 0;
  let totalOpportunities = 0;

  for (const hotel of segmentHotels) {
    const signals = Array.isArray(hotel?.signals) ? hotel.signals : [];
    if (signals.includes('NO_CHATBOT')) hotelsWithoutChatbot += 1;
    if (signals.includes('LOW_RATING')) hotelsLowRating += 1;
    if (signals.includes('HIGH_REVIEW_VOLUME')) hotelsHighReviewVolume += 1;
    totalOpportunities += Array.isArray(hotel?.opportunities) ? hotel.opportunities.length : 0;
  }

  return {
    hotelsWithoutChatbot,
    hotelsLowRating,
    hotelsHighReviewVolume,
    totalOpportunities,
  };
}

export async function getHotelLeadSignals(hotelId) {
  const hotel = await collectHotelContext(hotelId);
  if (!hotel) {
    const error = new Error('Hotel not found.');
    error.status = 404;
    throw error;
  }

  const [scoredHotel] = await computeLeadSignals([hotel]);
  const [segmentHotel] = await computeSegmentOpportunities([scoredHotel]);

  return {
    hotelId: segmentHotel.hotelId,
    hotelName: segmentHotel.hotelName,
    city: segmentHotel.city,
    latitude: segmentHotel.latitude ?? null,
    longitude: segmentHotel.longitude ?? null,
    leadScore: segmentHotel.leadScore,
    signals: segmentHotel.signals,
    opportunities: segmentHotel.opportunities,
    context: segmentHotel.context,
    segmentOpportunities: segmentHotel.segmentOpportunities,
  };
}

export async function refreshLeadData(city) {
  const normalizedFilters = await normalizeLeadFilters({ city, limit: 100 });
  const hotels = await collectHotelContext(normalizedFilters);

  return {
    city: normalizedFilters.city || city,
    hotels: hotels.map((hotel) => ({
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      city: hotel.city,
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
    })),
    total: hotels.length,
  };
}
