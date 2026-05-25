import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { EVENT_DEMAND_ZONE } from './marketHotelEventDemandZoneSignalService.js';
import { TOURISM_SPIKE } from './marketHotelTourismSpikeSignalService.js';
import { WEDDING_DEMAND_ZONE } from './marketHotelWeddingDemandZoneSignalService.js';

export const WEEKEND_COMPRESSION = 'WEEKEND_COMPRESSION';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

export function buildWeekendCompressionSignals(
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
        [TOURISM_SPIKE, EVENT_DEMAND_ZONE, WEDDING_DEMAND_ZONE].includes(signal.signalType),
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
      signalType: WEEKEND_COMPRESSION,
      signalStrength: neighborSignalCount,
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelWeekendCompressionSignalEngine(
  options = {},
  deps = defaultDeps,
) {
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

  logger.info('market_hotel_weekend_compression_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minNeighborSignalCount,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const neighbors = await deps.listMarketHotelNeighbors(city || null);
  const existingSignals = await deps.listMarketHotelSignals(
    [TOURISM_SPIKE, EVENT_DEMAND_ZONE, WEDDING_DEMAND_ZONE],
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

    logger.info('market_hotel_weekend_compression_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildWeekendCompressionSignals(
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
      signalTypes: [WEEKEND_COMPRESSION],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_weekend_compression_completed', summary);
  return summary;
}
