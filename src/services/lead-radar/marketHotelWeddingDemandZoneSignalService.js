import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { EVENT_DEMAND_ZONE } from './marketHotelEventDemandZoneSignalService.js';

export const WEDDING_DEMAND_ZONE = 'WEDDING_DEMAND_ZONE';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

export function buildWeddingDemandZoneSignals(
  hotels = [],
  neighbors = [],
  existingSignals = [],
  {
    maxDistanceKm = 3,
    minNeighborCount = 3,
    minGoogleRating = 4,
    minReviewCount = 200,
  } = {},
) {
  const eventDemandHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === EVENT_DEMAND_ZONE)
      .map((signal) => signal.hotelId),
  );
  const hotelMap = new Map(hotels.map((hotel) => [hotel.id, hotel]));

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    if (!eventDemandHotelIds.has(hotel.id)) {
      continue;
    }

    hotelsScanned += 1;

    const neighborCount = neighbors.filter((neighbor) => {
      if (neighbor.hotelId !== hotel.id || neighbor.distanceKm > maxDistanceKm) {
        return false;
      }

      const neighborHotel = hotelMap.get(neighbor.neighborHotelId);
      if (!neighborHotel) {
        return false;
      }

      return (
        neighborHotel.googleRating != null &&
        Number(neighborHotel.googleRating) >= minGoogleRating &&
        neighborHotel.reviewCount != null &&
        Number(neighborHotel.reviewCount) >= minReviewCount
      );
    }).length;

    if (neighborCount < minNeighborCount) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: WEDDING_DEMAND_ZONE,
      signalStrength: neighborCount,
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelWeddingDemandZoneSignalEngine(
  options = {},
  deps = defaultDeps,
) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 3));
  const minNeighborCount = Math.max(1, Number(options.minNeighborCount || 3));
  const minGoogleRating = Number(options.minGoogleRating || 4);
  const minReviewCount = Math.max(1, Number(options.minReviewCount || 200));

  logger.info('market_hotel_wedding_demand_zone_started', {
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
  const existingSignals = await deps.listMarketHotelSignals([EVENT_DEMAND_ZONE], city || null);

  if (!hotels.length) {
    const summary = {
      city: city || 'all',
      hotelsScanned: 0,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_wedding_demand_zone_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildWeddingDemandZoneSignals(
    hotels,
    neighbors,
    existingSignals,
    { maxDistanceKm, minNeighborCount, minGoogleRating, minReviewCount },
  );

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [WEDDING_DEMAND_ZONE],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_wedding_demand_zone_completed', summary);
  return summary;
}
