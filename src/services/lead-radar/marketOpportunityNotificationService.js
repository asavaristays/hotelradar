import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelNeighbors,
  listMarketRankedOpportunities,
  replaceMarketOpportunityNotifications,
} from '../../repositories/marketHotelRepository.js';

const defaultDeps = {
  listMarketRankedOpportunities,
  listMarketHotelNeighbors,
  replaceMarketOpportunityNotifications,
};

function toTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'invalid';
  }

  return date.toISOString().slice(0, 10);
}

export function buildMarketOpportunityNotifications(
  opportunities = [],
  neighbors = [],
  {
    maxDistanceKm = 5,
    minOpportunityScore = 4,
    maxPerHotelPerDay = 10,
  } = {},
) {
  const neighborMap = new Map();
  for (const neighbor of Array.isArray(neighbors) ? neighbors : []) {
    if (Number(neighbor?.distanceKm) > maxDistanceKm) {
      continue;
    }

    const hotelNeighbors = neighborMap.get(neighbor.hotelId) || [];
    hotelNeighbors.push(neighbor);
    neighborMap.set(neighbor.hotelId, hotelNeighbors);
  }

  const expandedRows = [];
  for (const opportunity of Array.isArray(opportunities) ? opportunities : []) {
    if (Number(opportunity?.score || 0) < minOpportunityScore) {
      continue;
    }

    const nearbyHotels = neighborMap.get(opportunity.hotelId) || [];
    for (const nearbyHotel of nearbyHotels) {
      expandedRows.push({
        hotelId: nearbyHotel.neighborHotelId,
        signalType: opportunity.signalType,
        opportunityScore: Number(opportunity.score || 0),
        createdAt: opportunity.createdAt,
      });
    }
  }

  expandedRows.sort((left, right) => {
    const scoreDelta = Number(right.opportunityScore || 0) - Number(left.opportunityScore || 0);
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

  const perHotelDayCounts = new Map();
  const notifications = [];

  for (const row of expandedRows) {
    const key = `${row.hotelId}:${dayKey(row.createdAt)}`;
    const count = Number(perHotelDayCounts.get(key) || 0);
    if (count >= maxPerHotelPerDay) {
      continue;
    }

    perHotelDayCounts.set(key, count + 1);
    notifications.push(row);
  }

  return notifications;
}

export async function runMarketOpportunityNotificationEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));
  const maxDistanceKm = Math.max(0.1, Number(options.maxDistanceKm || 5));
  const minOpportunityScore = Number(options.minOpportunityScore || 4);
  const maxPerHotelPerDay = Math.max(1, Number(options.maxPerHotelPerDay || 10));

  logger.info('market_opportunity_notifications_started', {
    city: city || 'all',
    batchSize,
    maxDistanceKm,
    minOpportunityScore,
    maxPerHotelPerDay,
  });

  const startedAt = Date.now();
  const [opportunities, neighbors] = await Promise.all([
    deps.listMarketRankedOpportunities(city || null),
    deps.listMarketHotelNeighbors(city || null),
  ]);

  const notifications = buildMarketOpportunityNotifications(opportunities, neighbors, {
    maxDistanceKm,
    minOpportunityScore,
    maxPerHotelPerDay,
  });

  const replaceResult = await deps.replaceMarketOpportunityNotifications(notifications, {
    batchSize,
  });

  const summary = {
    city: city || 'all',
    notificationsCreated: Number(replaceResult?.rowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_opportunity_notifications_completed', summary);
  return summary;
}
