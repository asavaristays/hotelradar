import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketOpportunityFeed,
  replaceMarketRankedOpportunities,
} from '../../repositories/marketHotelRepository.js';

export const SIGNAL_WEIGHTS = Object.freeze({
  WEEKEND_COMPRESSION: 5,
  DEMAND_SURGE_CLUSTER: 5,
  TOURISM_SPIKE: 4,
  CORPORATE_EVENT_CLUSTER: 4,
  WEDDING_DEMAND_ZONE: 4,
  EVENT_DEMAND_ZONE: 3,
  HIGH_REVIEW_ACTIVITY: 3,
  REPUTATION_WEAKNESS: 3,
  CHATBOT_GAP: 2,
  OTA_DEPENDENCE: 2,
});

const defaultDeps = {
  listMarketOpportunityFeed,
  replaceMarketRankedOpportunities,
};

function toTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function buildMarketRankedOpportunities(
  feedEntries = [],
  {
    perCityLimit = 100,
  } = {},
) {
  const rowsByCity = new Map();

  for (const entry of Array.isArray(feedEntries) ? feedEntries : []) {
    const city = String(entry?.city || '').trim();
    const signalType = String(entry?.signalType || '').trim();
    const weight = Number(SIGNAL_WEIGHTS[signalType] || 0);
    const signalStrength = Number(entry?.signalStrength || 0);

    if (!city || !entry?.hotelId || !signalType || weight <= 0) {
      continue;
    }

    const cityRows = rowsByCity.get(city) || [];
    cityRows.push({
      city,
      hotelId: entry.hotelId,
      signalType,
      score: weight * signalStrength,
      createdAt: entry.createdAt,
    });
    rowsByCity.set(city, cityRows);
  }

  const rankedRows = [];
  for (const cityRows of rowsByCity.values()) {
    cityRows.sort((left, right) => {
      const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const createdDelta = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
      if (createdDelta !== 0) {
        return createdDelta;
      }

      const signalTypeDelta = String(left.signalType || '').localeCompare(String(right.signalType || ''));
      if (signalTypeDelta !== 0) {
        return signalTypeDelta;
      }

      return String(left.hotelId || '').localeCompare(String(right.hotelId || ''));
    });

    rankedRows.push(...cityRows.slice(0, perCityLimit));
  }

  return rankedRows;
}

export async function runMarketRankedOpportunityEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const perCityLimit = Math.max(1, Number(options.perCityLimit || 100));

  logger.info('market_ranked_opportunities_started', {
    city: city || 'all',
    batchSize,
    perCityLimit,
  });

  const startedAt = Date.now();
  const feedEntries = await deps.listMarketOpportunityFeed(city || null);
  const rankedRows = buildMarketRankedOpportunities(feedEntries, { perCityLimit });
  const replaceResult = await deps.replaceMarketRankedOpportunities(rankedRows, { batchSize });

  const summary = {
    city: city || 'all',
    rankedEntries: Number(replaceResult?.rowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_ranked_opportunities_completed', summary);
  return summary;
}
