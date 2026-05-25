import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelsWithCoordinates,
  replaceMarketHotelNeighbors,
} from '../../repositories/marketHotelRepository.js';

const EARTH_RADIUS_KM = 6371;

const defaultDeps = {
  listMarketHotelsWithCoordinates,
  replaceMarketHotelNeighbors,
};

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceKm(pointA, pointB) {
  const latitudeDelta = toRadians(pointB.latitude - pointA.latitude);
  const longitudeDelta = toRadians(pointB.longitude - pointA.longitude);
  const latitudeA = toRadians(pointA.latitude);
  const latitudeB = toRadians(pointB.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function groupHotelsByCity(hotels = []) {
  const grouped = new Map();

  for (const hotel of hotels) {
    const cityHotels = grouped.get(hotel.city) || [];
    cityHotels.push(hotel);
    grouped.set(hotel.city, cityHotels);
  }

  return grouped;
}

function buildNeighborRowsForCity(
  hotels = [],
  {
    maxDistanceKm = env.marketHotelNeighborMaxDistanceKm,
    maxNeighbors = env.marketHotelNeighborMaxCount,
    processingBatchSize = env.marketHotelNeighborProcessingBatchSize,
  } = {},
) {
  const rows = [];
  let totalHotelsProcessed = 0;

  for (let start = 0; start < hotels.length; start += processingBatchSize) {
    const hotelBatch = hotels.slice(start, start + processingBatchSize);

    for (const hotel of hotelBatch) {
      totalHotelsProcessed += 1;

      const nearestNeighbors = hotels
        .filter((candidate) => candidate.id !== hotel.id)
        .map((candidate) => ({
          hotelId: hotel.id,
          neighborHotelId: candidate.id,
          distanceKm: haversineDistanceKm(hotel, candidate),
        }))
        .filter((neighbor) => neighbor.distanceKm <= maxDistanceKm)
        .sort((left, right) => left.distanceKm - right.distanceKm)
        .slice(0, maxNeighbors)
        .map((neighbor) => ({
          ...neighbor,
          distanceKm: Number(neighbor.distanceKm.toFixed(3)),
        }));

      rows.push(...nearestNeighbors);
    }
  }

  return {
    rows,
    totalHotelsProcessed,
  };
}

export async function runMarketHotelNeighborDetection(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const insertBatchSize = Math.max(
    1,
    Number(options.insertBatchSize || env.marketHotelNeighborInsertBatchSize || 500),
  );
  const processingBatchSize = Math.max(
    1,
    Number(options.processingBatchSize || env.marketHotelNeighborProcessingBatchSize || 100),
  );
  const maxDistanceKm = Math.max(
    0.1,
    Number(options.maxDistanceKm || env.marketHotelNeighborMaxDistanceKm || 5),
  );
  const maxNeighbors = Math.max(
    1,
    Number(options.maxNeighbors || env.marketHotelNeighborMaxCount || 20),
  );

  logger.info('market_hotel_neighbor_detection_started', {
    city: city || 'all',
    insertBatchSize,
    processingBatchSize,
    maxDistanceKm,
    maxNeighbors,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsWithCoordinates(city || null);
  const scopedHotels = city ? hotels.filter((hotel) => hotel.city === city) : hotels;
  const hotelsByCity = groupHotelsByCity(scopedHotels);

  let totalHotelsProcessed = 0;
  let totalNeighborsCreated = 0;
  let totalDeletedNeighbors = 0;

  for (const [currentCity, cityHotels] of hotelsByCity.entries()) {
    const { rows, totalHotelsProcessed: processedForCity } = buildNeighborRowsForCity(cityHotels, {
      maxDistanceKm,
      maxNeighbors,
      processingBatchSize,
    });

    const replaceResult = await deps.replaceMarketHotelNeighbors(
      cityHotels.map((hotel) => hotel.id),
      rows,
      { batchSize: insertBatchSize },
    );

    totalHotelsProcessed += processedForCity;
    totalNeighborsCreated += Number(replaceResult?.rowCount || 0);
    totalDeletedNeighbors += Number(replaceResult?.deletedRowCount || 0);

    logger.info('market_hotel_neighbor_city_completed', {
      city: currentCity,
      hotelsProcessed: processedForCity,
      neighborsCreated: Number(replaceResult?.rowCount || 0),
      deletedNeighbors: Number(replaceResult?.deletedRowCount || 0),
    });
  }

  const summary = {
    city: city || 'all',
    citiesProcessed: hotelsByCity.size,
    totalHotelsProcessed,
    totalNeighborsCreated,
    totalDeletedNeighbors,
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_neighbor_detection_completed', summary);

  return summary;
}
