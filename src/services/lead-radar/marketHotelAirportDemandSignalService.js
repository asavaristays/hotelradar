import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { HIGH_REVIEW_ACTIVITY } from './marketHotelReviewSignalService.js';
import { TOURISM_SPIKE } from './marketHotelTourismSpikeSignalService.js';

export const AIRPORT_DEMAND = 'AIRPORT_DEMAND';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelSignals,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

export function buildAirportDemandSignals(
  hotels = [],
  neighbors = [],
  existingSignals = [],
  {
    maxDistanceKm = 3,
    minNeighborCount = 2,
  } = {},
) {
  const tourismSpikeHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === TOURISM_SPIKE)
      .map((signal) => signal.hotelId),
  );
  const highReviewHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === HIGH_REVIEW_ACTIVITY)
      .map((signal) => signal.hotelId),
  );
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    if (!tourismSpikeHotelIds.has(hotel.id)) {
      continue;
    }

    hotelsScanned += 1;

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
      signalType: AIRPORT_DEMAND,
      signalStrength: neighborCount,
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelAirportDemandSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 3));
  const minNeighborCount = Math.max(1, Number(options.minNeighborCount || 2));

  logger.info('market_hotel_airport_demand_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minNeighborCount,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const neighbors = await deps.listMarketHotelNeighbors(city || null);
  const existingSignals = await deps.listMarketHotelSignals(
    [TOURISM_SPIKE, HIGH_REVIEW_ACTIVITY],
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

    logger.info('market_hotel_airport_demand_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildAirportDemandSignals(
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
      signalTypes: [AIRPORT_DEMAND],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_airport_demand_completed', summary);
  return summary;
}
