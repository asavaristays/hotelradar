import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { HIGH_REVIEW_ACTIVITY } from './marketHotelReviewSignalService.js';

export const DEMAND_SURGE_CLUSTER = 'DEMAND_SURGE_CLUSTER';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

export function buildDemandSurgeClusterSignals(
  hotels = [],
  neighbors = [],
  existingSignals = [],
  {
    maxDistanceKm = 3,
    minNeighborCount = 3,
  } = {},
) {
  const highReviewHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === HIGH_REVIEW_ACTIVITY)
      .map((signal) => signal.hotelId),
  );
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));

  let clustersScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    if (!highReviewHotelIds.has(hotel.id)) {
      continue;
    }

    clustersScanned += 1;

    const neighborCount = neighbors.filter(
      (neighbor) =>
        neighbor.hotelId === hotel.id &&
        neighbor.distanceKm <= maxDistanceKm &&
        hotelIds.has(neighbor.neighborHotelId) &&
        highReviewHotelIds.has(neighbor.neighborHotelId),
    ).length;

    if (neighborCount < minNeighborCount) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: DEMAND_SURGE_CLUSTER,
      signalStrength: neighborCount,
    });
  }

  return {
    clustersScanned,
    signals,
  };
}

export async function runMarketHotelDemandSurgeClusterSignalEngine(
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

  logger.info('market_hotel_demand_surge_cluster_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minNeighborCount,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const neighbors = await deps.listMarketHotelNeighbors(city || null);
  const existingSignals = await deps.listMarketHotelSignals([HIGH_REVIEW_ACTIVITY], city || null);

  if (!hotels.length) {
    const summary = {
      city: city || 'all',
      clustersScanned: 0,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_demand_surge_cluster_completed', summary);
    return summary;
  }

  const { clustersScanned, signals } = buildDemandSurgeClusterSignals(
    hotels,
    neighbors,
    existingSignals,
    { maxDistanceKm, minNeighborCount },
  );

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [DEMAND_SURGE_CLUSTER],
    },
  );

  const summary = {
    city: city || 'all',
    clustersScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_demand_surge_cluster_completed', summary);
  return summary;
}
