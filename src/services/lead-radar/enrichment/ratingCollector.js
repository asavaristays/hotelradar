import * as hotelEnrichmentRepository from '../../../repositories/hotelEnrichmentRepository.js';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 3;
const DEFAULT_MIN_DELAY_MS = 1200;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; HotelRADAR Lead Enrichment; +https://hotelradar.in)';

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enforceRateLimit(minDelayMs = DEFAULT_MIN_DELAY_MS) {
  const now = Date.now();
  const waitMs = Math.max(0, Number(minDelayMs || 0) - (now - lastRequestAt));
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
}

async function fetchHtml(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  minDelayMs = DEFAULT_MIN_DELAY_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('googleMapsUrl is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available');
  }

  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await enforceRateLimit(minDelayMs);
      const response = await fetchImpl(url, {
        headers: {
          'user-agent': DEFAULT_USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep((attempt + 1) * 500);
      }
    }
  }

  throw lastError || new Error('Unable to fetch Google Maps rating HTML');
}

function parsePublicRating(html) {
  const patterns = [
    /"ratingValue"\s*:\s*"?(?<rating>[0-5](?:\.\d)?)"?/i,
    /(?<rating>[0-5](?:\.\d)?)\s*(?:stars?|star rating)/i,
    /aria-label="(?<rating>[0-5](?:\.\d)?)\s*stars?"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = Number(match?.groups?.rating);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function mapExistingToUpsert(existing = {}, patch = {}) {
  return {
    hotelId: patch.hotelId ?? existing.hotel_id ?? null,
    publicRating: patch.publicRating ?? existing.public_rating ?? null,
    reviewCount: patch.reviewCount ?? existing.review_count ?? null,
    ratingSource: patch.ratingSource ?? existing.rating_source ?? null,
    reviewSource: patch.reviewSource ?? existing.review_source ?? null,
    hasChatbot: patch.hasChatbot ?? existing.has_chatbot ?? null,
    chatbotProvider: patch.chatbotProvider ?? existing.chatbot_provider ?? null,
    otaChannels: patch.otaChannels ?? existing.ota_channels ?? null,
    ratingLastCheckedAt: patch.ratingLastCheckedAt ?? existing.rating_last_checked_at ?? null,
    reviewLastCheckedAt: patch.reviewLastCheckedAt ?? existing.review_last_checked_at ?? null,
    chatbotDetectedAt: patch.chatbotDetectedAt ?? existing.chatbot_detected_at ?? null,
    otaPresenceLastCheckedAt: patch.otaPresenceLastCheckedAt ?? existing.ota_presence_last_checked_at ?? null,
  };
}

export async function collectRating({
  hotelId,
  googleMapsUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  minDelayMs = DEFAULT_MIN_DELAY_MS,
} = {}) {
  const html = await fetchHtml(googleMapsUrl, {
    timeoutMs,
    retries,
    minDelayMs,
    fetchImpl,
  });
  const publicRating = parsePublicRating(html);
  const existing = await hotelEnrichmentRepository.getHotelEnrichmentByHotelId(hotelId);
  const updated = await hotelEnrichmentRepository.upsertHotelEnrichment(
    mapExistingToUpsert(existing, {
      hotelId,
      publicRating,
      ratingSource: googleMapsUrl,
      ratingLastCheckedAt: new Date().toISOString(),
    }),
  );

  return {
    hotelId,
    publicRating,
    source: googleMapsUrl,
    updated,
  };
}

export async function collectRatingsForHotels(
  hotels = [],
  sourceResolver = () => ({}),
  options = {},
) {
  const results = [];

  for (const hotel of hotels) {
    const sourceConfig = sourceResolver(hotel) || {};
    if (!sourceConfig.googleMapsUrl) {
      results.push({
        hotelId: hotel?.hotelId ?? hotel?.id ?? null,
        skipped: true,
        reason: 'missing_google_maps_url',
      });
      continue;
    }

    results.push(await collectRating({
      hotelId: hotel?.hotelId ?? hotel?.id ?? null,
      googleMapsUrl: sourceConfig.googleMapsUrl,
      ...options,
    }));
  }

  return results;
}

