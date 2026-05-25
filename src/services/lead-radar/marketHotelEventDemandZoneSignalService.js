import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { HIGH_REVIEW_ACTIVITY } from './marketHotelReviewSignalService.js';
import { PRICE_PRESSURE } from './marketHotelPricePressureSignalService.js';

export const EVENT_DEMAND_ZONE = 'EVENT_DEMAND_ZONE';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

export function buildEventDemandZoneSignals(
  hotels = [],
  neighbors = [],
  existingSignals = [],
  {
    maxDistanceKm = 3,
    minNeighborCount = 2,
  } = {},
) {
  const eligibleHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === HIGH_REVIEW_ACTIVITY)
      .map((signal) => signal.hotelId),
  );
  const activeDemandNeighborIds = new Set(
    existingSignals
      .filter(
        (signal) =>
          signal.signalType === HIGH_REVIEW_ACTIVITY || signal.signalType === PRICE_PRESSURE,
      )
      .map((signal) => signal.hotelId),
  );
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    if (!eligibleHotelIds.has(hotel.id)) {
      continue;
    }

    hotelsScanned += 1;

    const neighborCount = neighbors.filter(
      (neighbor) =>
        neighbor.hotelId === hotel.id &&
        neighbor.distanceKm <= maxDistanceKm &&
        hotelIds.has(neighbor.neighborHotelId) &&
        activeDemandNeighborIds.has(neighbor.neighborHotelId),
    ).length;

    if (neighborCount < minNeighborCount) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: EVENT_DEMAND_ZONE,
      signalStrength: neighborCount,
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelEventDemandZoneSignalEngine(
  options = {},
  deps = defaultDeps,
) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 3));
  const minNeighborCount = Math.max(1, Number(options.minNeighborCount || 2));

  logger.info('market_hotel_event_demand_zone_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minNeighborCount,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const neighbors = await deps.listMarketHotelNeighbors(city || null);
  const existingSignals = await deps.listMarketHotelSignals(
    [HIGH_REVIEW_ACTIVITY, PRICE_PRESSURE],
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

    logger.info('market_hotel_event_demand_zone_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildEventDemandZoneSignals(
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
      signalTypes: [EVENT_DEMAND_ZONE],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_event_demand_zone_completed', summary);
  return summary;
}
