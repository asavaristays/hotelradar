import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';

export const REPUTATION_WEAKNESS = 'REPUTATION_WEAKNESS';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

function roundTo(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

export function buildReputationWeaknessSignals(
  hotels = [],
  neighbors = [],
  {
    weakRatingThreshold = env.marketHotelReputationWeakRatingThreshold,
  } = {},
) {
  const hotelMap = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const neighborMap = new Map();

  for (const neighbor of neighbors) {
    const entries = neighborMap.get(neighbor.hotelId) || [];
    entries.push(neighbor);
    neighborMap.set(neighbor.hotelId, entries);
  }

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    hotelsScanned += 1;

    if (hotel.googleRating == null || hotel.reviewCount == null) {
      continue;
    }

    if (Number(hotel.googleRating) >= weakRatingThreshold) {
      continue;
    }

    const neighborHotels = (neighborMap.get(hotel.id) || [])
      .map((entry) => hotelMap.get(entry.neighborHotelId))
      .filter(Boolean);

    const ratingNeighbors = neighborHotels.filter(
      (neighborHotel) => neighborHotel.googleRating != null,
    );
    const reviewNeighbors = neighborHotels.filter(
      (neighborHotel) => neighborHotel.reviewCount != null,
    );

    if (!ratingNeighbors.length || !reviewNeighbors.length) {
      continue;
    }

    const averageNeighborRating =
      ratingNeighbors.reduce(
        (sum, neighborHotel) => sum + Number(neighborHotel.googleRating || 0),
        0,
      ) / ratingNeighbors.length;
    const averageNeighborReviewCount =
      reviewNeighbors.reduce(
        (sum, neighborHotel) => sum + Number(neighborHotel.reviewCount || 0),
        0,
      ) / reviewNeighbors.length;

    if (
      !Number.isFinite(averageNeighborRating) ||
      !Number.isFinite(averageNeighborReviewCount)
    ) {
      continue;
    }

    if (Number(hotel.reviewCount) < averageNeighborReviewCount) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: REPUTATION_WEAKNESS,
      signalStrength: roundTo(averageNeighborRating - Number(hotel.googleRating), 4),
      averageNeighborRating: roundTo(averageNeighborRating, 4),
      averageNeighborReviewCount: roundTo(averageNeighborReviewCount, 2),
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelReputationSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(
    1,
    Number(options.batchSize || env.marketHotelSignalBatchSize || 500),
  );
  const weakRatingThreshold = Number(
    options.weakRatingThreshold || env.marketHotelReputationWeakRatingThreshold || 4,
  );

  logger.info('market_hotel_reputation_signal_started', {
    city: city || 'all',
    batchSize,
    weakRatingThreshold,
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

    logger.info('market_hotel_reputation_signal_completed', summary);

    return summary;
  }

  const { hotelsScanned, signals } = buildReputationWeaknessSignals(hotels, neighbors, {
    weakRatingThreshold,
  });

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [REPUTATION_WEAKNESS],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_reputation_signal_completed', summary);

  return summary;
}
