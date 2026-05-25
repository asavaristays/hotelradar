import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listRecentMarketHotelSignalsForFeed,
  replaceMarketOpportunityFeed,
} from '../../repositories/marketHotelRepository.js';

export const MARKET_OPPORTUNITY_PRIORITY_SIGNALS = new Set([
  'DEMAND_SURGE_CLUSTER',
  'WEEKEND_COMPRESSION',
  'TOURISM_SPIKE',
  'CORPORATE_EVENT_CLUSTER',
  'WEDDING_DEMAND_ZONE',
]);

const defaultDeps = {
  listRecentMarketHotelSignalsForFeed,
  replaceMarketOpportunityFeed,
};

function toTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function buildMarketOpportunityFeedEntries(
  signals = [],
  {
    minSignalStrength = 2,
    perCityLimit = 200,
  } = {},
) {
  const filteredSignals = (Array.isArray(signals) ? signals : []).filter((signal) => {
    const strength = Number(signal?.signalStrength || 0);
    return (
      strength >= minSignalStrength ||
      MARKET_OPPORTUNITY_PRIORITY_SIGNALS.has(String(signal?.signalType || '').trim())
    );
  });

  const rowsByCity = new Map();
  for (const signal of filteredSignals) {
    const city = String(signal.city || '').trim();
    if (!city) {
      continue;
    }

    const cityRows = rowsByCity.get(city) || [];
    cityRows.push({
      city,
      signalType: signal.signalType,
      hotelId: signal.hotelId,
      createdAt: signal.createdAt,
      signalStrength: Number(signal.signalStrength || 0),
    });
    rowsByCity.set(city, cityRows);
  }

  const feedRows = [];
  for (const cityRows of rowsByCity.values()) {
    cityRows.sort((left, right) => {
      const createdDelta = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
      if (createdDelta !== 0) {
        return createdDelta;
      }

      const strengthDelta = Number(right.signalStrength || 0) - Number(left.signalStrength || 0);
      if (strengthDelta !== 0) {
        return strengthDelta;
      }

      const signalTypeDelta = String(left.signalType || '').localeCompare(String(right.signalType || ''));
      if (signalTypeDelta !== 0) {
        return signalTypeDelta;
      }

      return String(left.hotelId || '').localeCompare(String(right.hotelId || ''));
    });

    feedRows.push(...cityRows.slice(0, perCityLimit));
  }

  return feedRows;
}

export async function runMarketOpportunityFeedEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const lookbackHours = Math.max(1, Number(options.lookbackHours || 24));
  const perCityLimit = Math.max(1, Number(options.perCityLimit || 200));
  const minSignalStrength = Number(options.minSignalStrength || 2);

  logger.info('market_opportunity_feed_started', {
    city: city || 'all',
    batchSize,
    lookbackHours,
    perCityLimit,
    minSignalStrength,
  });

  const startedAt = Date.now();
  const signals = await deps.listRecentMarketHotelSignalsForFeed({
    city: city || null,
    hours: lookbackHours,
  });

  const feedRows = buildMarketOpportunityFeedEntries(signals, {
    minSignalStrength,
    perCityLimit,
  });

  const replaceResult = await deps.replaceMarketOpportunityFeed(feedRows, { batchSize });

  const summary = {
    city: city || 'all',
    signalsInserted: Number(replaceResult?.rowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_opportunity_feed_completed', summary);
  return summary;
}
