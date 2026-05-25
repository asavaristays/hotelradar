import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listFestivalCityEvents,
  listMarketHotelsWithCoordinates,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { haversineDistanceKm } from './marketHotelNeighborService.js';

export const FESTIVAL_DEMAND = 'FESTIVAL_DEMAND';

const FESTIVAL_CATEGORIES = [
  'festival',
  'carnival',
  'major holiday',
  'city festival',
  'cultural event',
];

const defaultDeps = {
  listFestivalCityEvents,
  listMarketHotelsWithCoordinates,
  replaceMarketHotelSignals,
};

export function buildFestivalDemandSignals(
  events = [],
  hotels = [],
  {
    maxDistanceKm = 5,
  } = {},
) {
  const hotelsByCity = new Map();
  for (const hotel of hotels) {
    const cityHotels = hotelsByCity.get(hotel.city) || [];
    cityHotels.push(hotel);
    hotelsByCity.set(hotel.city, cityHotels);
  }

  const signaledHotels = new Map();
  let eventsScanned = 0;

  for (const event of events) {
    eventsScanned += 1;

    const cityHotels = hotelsByCity.get(event.city) || [];
    for (const hotel of cityHotels) {
      const distanceKm = haversineDistanceKm(
        { latitude: event.latitude, longitude: event.longitude },
        { latitude: hotel.latitude, longitude: hotel.longitude },
      );

      if (distanceKm > maxDistanceKm) {
        continue;
      }

      if (!signaledHotels.has(hotel.id)) {
        signaledHotels.set(hotel.id, {
          hotelId: hotel.id,
          signalType: FESTIVAL_DEMAND,
          signalStrength: 1,
        });
      }
    }
  }

  return {
    eventsScanned,
    signals: Array.from(signaledHotels.values()),
  };
}

export async function runMarketHotelFestivalDemandSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 5));

  logger.info('market_hotel_festival_demand_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
  });

  const startedAt = Date.now();
  const [events, hotels] = await Promise.all([
    deps.listFestivalCityEvents(city || null, FESTIVAL_CATEGORIES),
    deps.listMarketHotelsWithCoordinates(city || null),
  ]);

  if (!events.length || !hotels.length) {
    const summary = {
      city: city || 'all',
      eventsScanned: events.length,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_festival_demand_completed', summary);
    return summary;
  }

  const { eventsScanned, signals } = buildFestivalDemandSignals(events, hotels, {
    maxDistanceKm,
  });

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [FESTIVAL_DEMAND],
    },
  );

  const summary = {
    city: city || 'all',
    eventsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_festival_demand_completed', summary);
  return summary;
}
