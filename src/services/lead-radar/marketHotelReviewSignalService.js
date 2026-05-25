import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';

export const HIGH_REVIEW_ACTIVITY = 'HIGH_REVIEW_ACTIVITY';

const defaultDeps = {
  listMarketHotelNeighbors,
  listMarketHotelsForSignals,
  replaceMarketHotelSignals,
};

function roundTo(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

export function buildHighReviewActivitySignals(
  hotels = [],
  neighbors = [],
  {
    minReviewVolumeRatio = env.marketHotelHighReviewRatioThreshold,
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

    if (hotel.reviewCount == null || hotel.reviewCount <= 0) {
      continue;
    }

    const neighborEntries = (neighborMap.get(hotel.id) || [])
      .map((entry) => hotelMap.get(entry.neighborHotelId))
      .filter((neighborHotel) => neighborHotel && neighborHotel.reviewCount != null && neighborHotel.reviewCount > 0);

    if (!neighborEntries.length) {
      continue;
    }

    const averageNeighborReviews =
      neighborEntries.reduce((sum, neighborHotel) => sum + Number(neighborHotel.reviewCount || 0), 0) /
      neighborEntries.length;

    if (!Number.isFinite(averageNeighborReviews) || averageNeighborReviews <= 0) {
      continue;
    }

    const reviewVolumeRatio = Number(hotel.reviewCount) / averageNeighborReviews;
    if (reviewVolumeRatio < minReviewVolumeRatio) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: HIGH_REVIEW_ACTIVITY,
      signalStrength: roundTo(reviewVolumeRatio, 4),
      averageNeighborReviews: roundTo(averageNeighborReviews, 2),
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelReviewSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(
    1,
    Number(options.batchSize || env.marketHotelSignalBatchSize || 500),
  );
  const minReviewVolumeRatio = Math.max(
    1,
    Number(options.minReviewVolumeRatio || env.marketHotelHighReviewRatioThreshold || 2),
  );

  logger.info('market_hotel_review_signal_started', {
    city: city || 'all',
    batchSize,
    minReviewVolumeRatio,
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

    logger.info('market_hotel_review_signal_completed', summary);

    return summary;
  }

  const { hotelsScanned, signals } = buildHighReviewActivitySignals(hotels, neighbors, {
    minReviewVolumeRatio,
  });

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [HIGH_REVIEW_ACTIVITY],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_review_signal_completed', summary);

  return summary;
}
