import { listRecentMarketSignalsForMap } from '../repositories/marketHotelRepository.js';

const CACHE_TTL_MS = 30_000;
let cachedPayload = null;
let cachedAt = 0;

function getCachedPayload() {
  if (!cachedPayload) {
    return null;
  }

  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    cachedPayload = null;
    cachedAt = 0;
    return null;
  }

  return cachedPayload;
}

function setCachedPayload(payload) {
  cachedPayload = payload;
  cachedAt = Date.now();
}

export async function getMarketIntelligenceMapPayload(
  { limit = 1000, hours = 24 } = {},
  deps = { listRecentMarketSignalsForMap },
) {
  const cached = getCachedPayload();
  if (cached) {
    return cached;
  }

  const signals = await deps.listRecentMarketSignalsForMap({ limit, hours });
  const payload = { signals };
  setCachedPayload(payload);
  return payload;
}
