import { getHotelById } from '../repositories/hotelRepository.js';
import { listMarketHotelSignals, listMarketHotelsByNamesAndCity } from '../repositories/marketHotelRepository.js';
import { getCompetitiveGrid } from './dashboardService.js';
import { HIGH_REVIEW_ACTIVITY } from './lead-radar/marketHotelReviewSignalService.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

function getCachedPayload(hotelId) {
  const cached = responseCache.get(hotelId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(hotelId);
    return null;
  }

  return cached.payload;
}

function setCachedPayload(hotelId, payload) {
  responseCache.set(hotelId, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function median(values = []) {
  const sorted = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (!sorted.length) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 2) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function toRecommendedAdjustment(pricePositionPercent) {
  const safe = Number(pricePositionPercent || 0);
  if (safe >= 10) {
    return 'Reduce rate by 5-8% to move closer to the market pocket.';
  }
  if (safe <= -10) {
    return 'Increase rate by 5-8% while monitoring pickup and conversion.';
  }
  return 'Hold current rate and monitor competitor movement closely.';
}

function buildRadarRecommendation(pricePositionPercent, marketMedianPrice, yourPrice) {
  const safe = Number(pricePositionPercent || 0);
  if (marketMedianPrice <= 0 || yourPrice <= 0) {
    return 'Insufficient live pricing data to produce a competitor recommendation.';
  }
  if (safe >= 10) {
    return 'You are priced above nearby competition. Protect occupancy before pushing further.';
  }
  if (safe <= -10) {
    return 'You are priced below nearby competition. There may be room to lift rates safely.';
  }
  return 'You are trading close to the market median. Maintain rate and monitor pickup.';
}

export async function getCompetitorIntelligenceForUser(
  user,
  deps = {
    getHotelById,
    getCompetitiveGrid,
    listMarketHotelsByNamesAndCity,
    listMarketHotelSignals,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for competitor intelligence.');
    error.status = 400;
    throw error;
  }

  const hotelId = hotelIds[0];
  const cached = getCachedPayload(hotelId);
  if (cached) {
    return cached;
  }

  const hotel = await deps.getHotelById(hotelId);
  if (!hotel?.city) {
    const error = new Error('Unable to determine hotel city from authenticated context.');
    error.status = 404;
    throw error;
  }

  const grid = await deps.getCompetitiveGrid(hotelId);
  const [ownRow, ...competitorRows] = Array.isArray(grid) ? grid : [];
  const topCompetitors = competitorRows
    .filter((row) => Number(row?.price || 0) > 0)
    .slice(0, 5);

  const competitorPrices = topCompetitors.map((row) => Number(row.price || 0)).filter((price) => price > 0);
  const yourPrice = Number(ownRow?.price || 0);
  const marketMedianPrice = round(median(competitorPrices), 0);
  const pricePositionPercent =
    marketMedianPrice > 0 && yourPrice > 0
      ? round(((yourPrice - marketMedianPrice) / marketMedianPrice) * 100, 2)
      : 0;

  const matchedHotels = await deps.listMarketHotelsByNamesAndCity(
    hotel.city,
    topCompetitors.map((row) => row.name),
  );
  const matchedHotelIds = matchedHotels.map((entry) => entry.id);
  const reviewSignals = await deps.listMarketHotelSignals([HIGH_REVIEW_ACTIVITY], hotel.city);
  const reviewSignalSet = new Set(
    reviewSignals
      .filter((signal) => matchedHotelIds.includes(signal.hotelId))
      .map((signal) => signal.hotelId),
  );

  const matchedByName = new Map(
    matchedHotels.map((entry) => [String(entry.hotelName || '').trim().toLowerCase(), entry]),
  );

  const payload = {
    hotel_id: hotelId,
    city: hotel.city,
    your_price: round(yourPrice, 0),
    market_median_price: marketMedianPrice,
    price_position_percent: pricePositionPercent,
    recommended_adjustment: toRecommendedAdjustment(pricePositionPercent),
    radar_recommendation: buildRadarRecommendation(pricePositionPercent, marketMedianPrice, yourPrice),
    competitors: topCompetitors.map((row) => {
      const matched = matchedByName.get(String(row.name || '').trim().toLowerCase());
      return {
        hotel_name: row.name,
        price: round(Number(row.price || 0), 0),
        rating: matched?.googleRating ?? null,
        review_activity_signal: matched ? reviewSignalSet.has(matched.id) : false,
      };
    }),
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
