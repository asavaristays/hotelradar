import { getHotelById } from '../repositories/hotelRepository.js';
import { getCompetitiveGrid } from './dashboardService.js';
import { getDashboard } from './dashboardService.js';

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

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
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

export async function getMarketPositionIntelligenceForUser(
  user,
  deps = {
    getHotelById,
    getDashboard,
    getCompetitiveGrid,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for market position intelligence.');
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

  const [dashboard, grid] = await Promise.all([
    deps.getDashboard(hotelId, {
      user_id: user?.id || null,
      user_role: user?.role || null,
    }),
    deps.getCompetitiveGrid(hotelId),
  ]);

  const [ownRow, ...competitorRows] = Array.isArray(grid) ? grid : [];
  const competitorPrices = competitorRows.map((row) => Number(row.price || 0)).filter((value) => value > 0);

  const currentPrice = round(
    dashboard?.marketPosition?.hotelPrice || ownRow?.price || 0,
    0,
  );
  const marketMedianPrice = round(
    median(competitorPrices) || dashboard?.marketPosition?.marketAvg || 0,
    0,
  );
  const optimalPrice = round(
    dashboard?.suggestedPricing?.base || currentPrice,
    0,
  );
  const positionPercent =
    marketMedianPrice > 0 && currentPrice > 0
      ? round(((currentPrice - marketMedianPrice) / marketMedianPrice) * 100)
      : 0;
  const suggestedAdjustment = round(optimalPrice - currentPrice, 0);

  const payload = {
    hotel_id: hotelId,
    city: hotel.city,
    current_price: currentPrice,
    market_median_price: marketMedianPrice,
    position_percent: positionPercent,
    optimal_price: optimalPrice,
    suggested_adjustment: suggestedAdjustment,
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
