import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';

export const CORPORATE_EVENT_CLUSTER = 'CORPORATE_EVENT_CLUSTER';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

function isQualifiedCorporateHotel(
  hotel,
  { minGoogleRating = 4, minReviewCount = 150 } = {},
) {
  return (
    hotel &&
    hotel.googleRating != null &&
    Number(hotel.googleRating) >= minGoogleRating &&
    hotel.reviewCount != null &&
    Number(hotel.reviewCount) >= minReviewCount
  );
}

export function buildCorporateEventClusterSignals(
  hotels = [],
  neighbors = [],
  {
    maxDistanceKm = 3,
    minNeighborCount = 4,
    minGoogleRating = 4,
    minReviewCount = 150,
  } = {},
) {
  const hotelMap = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const qualifiedHotelIds = new Set(
    hotels
      .filter((hotel) => isQualifiedCorporateHotel(hotel, { minGoogleRating, minReviewCount }))
      .map((hotel) => hotel.id),
  );

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    if (!qualifiedHotelIds.has(hotel.id)) {
      continue;
    }

    hotelsScanned += 1;

    const neighborCount = neighbors.filter((neighbor) => {
      if (neighbor.hotelId !== hotel.id || neighbor.distanceKm > maxDistanceKm) {
        return false;
      }

      const neighborHotel = hotelMap.get(neighbor.neighborHotelId);
      return isQualifiedCorporateHotel(neighborHotel, { minGoogleRating, minReviewCount });
    }).length;

    if (neighborCount < minNeighborCount) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: CORPORATE_EVENT_CLUSTER,
      signalStrength: neighborCount,
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelCorporateEventClusterSignalEngine(
  options = {},
  deps = defaultDeps,
) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 3));
  const minNeighborCount = Math.max(1, Number(options.minNeighborCount || 4));
  const minGoogleRating = Number(options.minGoogleRating || 4);
  const minReviewCount = Math.max(1, Number(options.minReviewCount || 150));

  logger.info('market_hotel_corporate_event_cluster_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minNeighborCount,
    minGoogleRating,
    minReviewCount,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const neighbors = await deps.listMarketHotelNeighbors(city || null);

  if (!hotels.length) {
    const summary = {
      city: city || 'all',
      hotelsScanned: 0,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_corporate_event_cluster_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildCorporateEventClusterSignals(hotels, neighbors, {
    maxDistanceKm,
    minNeighborCount,
    minGoogleRating,
    minReviewCount,
  });

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [CORPORATE_EVENT_CLUSTER],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_corporate_event_cluster_completed', summary);
  return summary;
}
