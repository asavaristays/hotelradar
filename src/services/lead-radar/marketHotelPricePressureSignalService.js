import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelsForSignals,
  listMarketHotelSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { DEMAND_SURGE_CLUSTER } from './marketHotelDemandSurgeClusterSignalService.js';

export const PRICE_PRESSURE = 'PRICE_PRESSURE';

const defaultDeps = {
  listMarketHotelsForSignals,
  listMarketHotelSignals,
  replaceMarketHotelSignals,
};

export function buildPricePressureSignals(hotels = [], existingSignals = []) {
  const demandSurgeHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === DEMAND_SURGE_CLUSTER)
      .map((signal) => signal.hotelId),
  );

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    hotelsScanned += 1;

    if (hotel.googleRating == null || hotel.reviewCount == null) {
      continue;
    }

    if (Number(hotel.googleRating) < 4 || Number(hotel.reviewCount) < 150) {
      continue;
    }

    if (!demandSurgeHotelIds.has(hotel.id)) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: PRICE_PRESSURE,
      signalStrength: Number(hotel.reviewCount || 0),
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelPricePressureSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));

  logger.info('market_hotel_price_pressure_signal_started', {
    city: city || 'all',
    batchSize,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const existingSignals = await deps.listMarketHotelSignals([DEMAND_SURGE_CLUSTER], city || null);

  if (!hotels.length) {
    const summary = {
      city: city || 'all',
      hotelsScanned: 0,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_price_pressure_signal_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildPricePressureSignals(hotels, existingSignals);

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [PRICE_PRESSURE],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_price_pressure_signal_completed', summary);
  return summary;
}
