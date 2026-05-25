import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { DEMAND_SURGE_CLUSTER } from './marketHotelDemandSurgeClusterSignalService.js';
import { EVENT_DEMAND_ZONE } from './marketHotelEventDemandZoneSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from './marketHotelReviewSignalService.js';

export const TOURISM_SPIKE = 'TOURISM_SPIKE';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

export function buildTourismSpikeSignals(
  hotels = [],
  neighbors = [],
  existingSignals = [],
  {
    maxDistanceKm = 3,
    minNeighborSignalCount = 3,
  } = {},
) {
  const activeSignalHotelIds = new Set(
    existingSignals
      .filter((signal) =>
        [
          HIGH_REVIEW_ACTIVITY,
          EVENT_DEMAND_ZONE,
          DEMAND_SURGE_CLUSTER,
        ].includes(signal.signalType),
      )
      .map((signal) => signal.hotelId),
  );
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    hotelsScanned += 1;

    const neighborSignalCount = neighbors.filter(
      (neighbor) =>
        neighbor.hotelId === hotel.id &&
        neighbor.distanceKm <= maxDistanceKm &&
        hotelIds.has(neighbor.neighborHotelId) &&
        activeSignalHotelIds.has(neighbor.neighborHotelId),
    ).length;

    if (neighborSignalCount < minNeighborSignalCount) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: TOURISM_SPIKE,
      signalStrength: neighborSignalCount,
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelTourismSpikeSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 3));
  const minNeighborSignalCount = Math.max(
    1,
    Number(options.minNeighborSignalCount || 3),
  );

  logger.info('market_hotel_tourism_spike_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minNeighborSignalCount,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const neighbors = await deps.listMarketHotelNeighbors(city || null);
  const existingSignals = await deps.listMarketHotelSignals(
    [HIGH_REVIEW_ACTIVITY, EVENT_DEMAND_ZONE, DEMAND_SURGE_CLUSTER],
    city || null,
  );

  if (!hotels.length) {
    const summary = {
      city: city || 'all',
      hotelsScanned: 0,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_tourism_spike_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildTourismSpikeSignals(
    hotels,
    neighbors,
    existingSignals,
    { maxDistanceKm, minNeighborSignalCount },
  );

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [TOURISM_SPIKE],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_tourism_spike_completed', summary);
  return summary;
}
