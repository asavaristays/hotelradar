import { getHotelById } from '../repositories/hotelRepository.js';
import { getCompetitiveGrid, getDashboard } from './dashboardService.js';

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

export async function getMissedRevenueForUser(
  user,
  deps = {
    getHotelById,
    getDashboard,
    getCompetitiveGrid,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for missed revenue analysis.');
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
  const occupancyProxyValues = competitorRows
    .map((row) => Number(row.occupancyProxy || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const yourAvgPrice = round(
    dashboard?.marketPosition?.hotelPrice || ownRow?.price || 0,
    0,
  );
  const marketAvgPrice = round(
    competitorPrices.length
      ? competitorPrices.reduce((sum, value) => sum + value, 0) / competitorPrices.length
      : dashboard?.marketPosition?.marketAvg || 0,
    0,
  );
  const occupancyEstimate = round(
    occupancyProxyValues.length
      ? clamp(
          occupancyProxyValues.reduce((sum, value) => sum + value, 0) / occupancyProxyValues.length / 100,
          0.35,
          0.95,
        )
      : 0.75,
    2,
  );
  const roomsAvailable = Math.max(1, Number(hotel.room_count || 20));
  const period = 'last_weekend';
  const rateGap = Math.max(0, marketAvgPrice - yourAvgPrice);
  const weekendRoomNights = 2 * roomsAvailable * occupancyEstimate;
  const estimatedMissedRevenue = round(rateGap * weekendRoomNights, 0);

  const payload = {
    hotel_id: hotelId,
    city: hotel.city,
    period,
    your_avg_price: yourAvgPrice,
    market_avg_price: marketAvgPrice,
    rooms_available: roomsAvailable,
    occupancy_estimate: occupancyEstimate,
    estimated_missed_revenue: estimatedMissedRevenue,
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
