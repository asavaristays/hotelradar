import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelBenchmarks,
} from '../../repositories/marketHotelRepository.js';

const defaultDeps = {
  listMarketHotelsForSignals,
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  replaceMarketHotelBenchmarks,
};

function roundTo(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

export function buildMarketHotelBenchmarks(
  hotels = [],
  neighbors = [],
  signals = [],
  {
    maxDistanceKm = 5,
  } = {},
) {
  const hotelMap = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const signalCountByHotel = new Map();

  for (const signal of Array.isArray(signals) ? signals : []) {
    const hotelId = signal?.hotelId;
    if (!hotelId) {
      continue;
    }

    signalCountByHotel.set(hotelId, Number(signalCountByHotel.get(hotelId) || 0) + 1);
  }

  const neighborMap = new Map();
  for (const neighbor of Array.isArray(neighbors) ? neighbors : []) {
    if (Number(neighbor?.distanceKm) > maxDistanceKm) {
      continue;
    }

    const hotelNeighbors = neighborMap.get(neighbor.hotelId) || [];
    hotelNeighbors.push(neighbor);
    neighborMap.set(neighbor.hotelId, hotelNeighbors);
  }

  const rows = [];
  for (const hotel of hotels) {
    const hotelNeighbors = neighborMap.get(hotel.id) || [];
    const nearbyHotels = hotelNeighbors
      .map((neighbor) => hotelMap.get(neighbor.neighborHotelId))
      .filter(Boolean);

    const nearbyHotelCount = nearbyHotels.length;
    const ratedNearbyHotels = nearbyHotels.filter((nearbyHotel) => nearbyHotel.googleRating != null);
    const reviewedNearbyHotels = nearbyHotels.filter((nearbyHotel) => nearbyHotel.reviewCount != null);

    const avgNearbyRating = ratedNearbyHotels.length
      ? roundTo(
          ratedNearbyHotels.reduce(
            (total, nearbyHotel) => total + Number(nearbyHotel.googleRating || 0),
            0,
          ) / ratedNearbyHotels.length,
        )
      : null;

    const avgNearbyReviews = reviewedNearbyHotels.length
      ? roundTo(
          reviewedNearbyHotels.reduce(
            (total, nearbyHotel) => total + Number(nearbyHotel.reviewCount || 0),
            0,
          ) / reviewedNearbyHotels.length,
        )
      : null;

    const nearbySignalCount = nearbyHotels.reduce(
      (total, nearbyHotel) => total + Number(signalCountByHotel.get(nearbyHotel.id) || 0),
      0,
    );

    rows.push({
      hotelId: hotel.id,
      city: hotel.city,
      nearbyHotelCount,
      avgNearbyRating,
      avgNearbyReviews,
      nearbySignalCount,
    });
  }

  return rows;
}

export async function runMarketHotelBenchmarkEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 5));

  logger.info('market_hotel_benchmarks_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
  });

  const startedAt = Date.now();
  const [hotels, neighbors, signals] = await Promise.all([
    deps.listMarketHotelsForSignals(city || null),
    deps.listMarketHotelNeighbors(city || null),
    deps.listMarketHotelSignals([], city || null),
  ]);

  const rows = buildMarketHotelBenchmarks(hotels, neighbors, signals, { maxDistanceKm });
  const replaceResult = await deps.replaceMarketHotelBenchmarks(rows, { batchSize });

  const summary = {
    city: city || 'all',
    hotelsProcessed: Number(replaceResult?.rowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_benchmarks_completed', summary);
  return summary;
}
