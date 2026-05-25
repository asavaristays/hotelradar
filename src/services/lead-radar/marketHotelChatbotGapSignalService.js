import { logger } from '../../config/logger.js';
import { assertCityInScope } from '../../config/productScope.js';
import {
  listMarketHotelsForSignals,
  listMarketHotelSignals,
  replaceMarketHotelSignals,
} from '../../repositories/marketHotelRepository.js';
import { HIGH_REVIEW_ACTIVITY } from './marketHotelReviewSignalService.js';

export const CHATBOT_GAP = 'CHATBOT_GAP';

const defaultDeps = {
  listMarketHotelsForSignals,
  listMarketHotelSignals,
  replaceMarketHotelSignals,
};

export function buildChatbotGapSignals(hotels = [], existingSignals = []) {
  const highReviewHotelIds = new Set(
    existingSignals
      .filter((signal) => signal.signalType === HIGH_REVIEW_ACTIVITY)
      .map((signal) => signal.hotelId),
  );

  let hotelsScanned = 0;
  const signals = [];

  for (const hotel of hotels) {
    hotelsScanned += 1;

    const chatbotMissing = hotel.hasChatbot == null || hotel.hasChatbot === false;
    if (!chatbotMissing) {
      continue;
    }

    if (!highReviewHotelIds.has(hotel.id)) {
      continue;
    }

    signals.push({
      hotelId: hotel.id,
      signalType: CHATBOT_GAP,
      signalStrength: Number(hotel.reviewCount || 0),
    });
  }

  return {
    hotelsScanned,
    signals,
  };
}

export async function runMarketHotelChatbotGapSignalEngine(options = {}, deps = defaultDeps) {
  const city = options.city ? String(options.city).trim() : '';
  if (city) {
    assertCityInScope(city);
  }

  const batchSize = Math.max(1, Number(options.batchSize || 500));

  logger.info('market_hotel_chatbot_gap_signal_started', {
    city: city || 'all',
    batchSize,
  });

  const startedAt = Date.now();
  const hotels = await deps.listMarketHotelsForSignals(city || null);
  const existingSignals = await deps.listMarketHotelSignals([HIGH_REVIEW_ACTIVITY], city || null);

  if (!hotels.length) {
    const summary = {
      city: city || 'all',
      hotelsScanned: 0,
      signalsCreated: 0,
      deletedSignals: 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('market_hotel_chatbot_gap_signal_completed', summary);
    return summary;
  }

  const { hotelsScanned, signals } = buildChatbotGapSignals(hotels, existingSignals);

  const replaceResult = await deps.replaceMarketHotelSignals(
    hotels.map((hotel) => hotel.id),
    signals,
    {
      batchSize,
      signalTypes: [CHATBOT_GAP],
    },
  );

  const summary = {
    city: city || 'all',
    hotelsScanned,
    signalsCreated: Number(replaceResult?.rowCount || 0),
    deletedSignals: Number(replaceResult?.deletedRowCount || 0),
    durationMs: Date.now() - startedAt,
  };

  logger.info('market_hotel_chatbot_gap_signal_completed', summary);
  return summary;
}
