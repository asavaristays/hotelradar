/**
 * Build lead-scoring signals from hotel, demand, pricing, and data-health
 * context without duplicating the existing hotel intelligence engines.
 */

function hasOtaChannels(otaChannels) {
  if (Array.isArray(otaChannels)) return otaChannels.length > 0;
  if (otaChannels && typeof otaChannels === 'object') return Object.keys(otaChannels).length > 0;
  return false;
}

function normalizeNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundContextMetric(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function buildPercentileMap(hotels = [], valueSelector) {
  const comparableHotels = hotels
    .map((hotel) => ({
      hotelId: hotel.hotelId,
      value: valueSelector(hotel),
    }))
    .filter((entry) => Number.isFinite(entry.value));

  if (!comparableHotels.length) return new Map();

  return new Map(
    comparableHotels.map((entry) => {
      const percentile =
        (comparableHotels.filter((candidate) => candidate.value <= entry.value).length
          / comparableHotels.length) * 100;
      return [entry.hotelId, roundContextMetric(percentile)];
    }),
  );
}

function buildChatbotAdoptionMap(hotels = []) {
  const comparableHotels = hotels.filter((hotel) => typeof hotel?.hasChatbot === 'boolean');
  if (!comparableHotels.length) return new Map();

  const adoptionRate =
    (comparableHotels.filter((hotel) => hotel.hasChatbot === true).length / comparableHotels.length) * 100;

  return new Map(
    comparableHotels.map((hotel) => [hotel.hotelId, roundContextMetric(adoptionRate)]),
  );
}

function buildContextMaps(scoredHotels = []) {
  const hotelsByCity = new Map();

  for (const hotel of scoredHotels) {
    const cityKey = String(hotel?.city || '').trim().toLowerCase() || '__unknown__';
    if (!hotelsByCity.has(cityKey)) {
      hotelsByCity.set(cityKey, []);
    }
    hotelsByCity.get(cityKey).push(hotel);
  }

  const contextByHotelId = new Map();

  for (const hotelsInCity of hotelsByCity.values()) {
    const ratingPercentiles = buildPercentileMap(hotelsInCity, (hotel) => hotel.rating);
    const reviewPercentiles = buildPercentileMap(hotelsInCity, (hotel) => hotel.reviewCount);
    const chatbotAdoptionRates = buildChatbotAdoptionMap(hotelsInCity);

    for (const hotel of hotelsInCity) {
      contextByHotelId.set(hotel.hotelId, {
        ratingPercentile: ratingPercentiles.get(hotel.hotelId) ?? null,
        reviewVolumePercentile: reviewPercentiles.get(hotel.hotelId) ?? null,
        chatbotAdoptionRate: chatbotAdoptionRates.get(hotel.hotelId) ?? null,
      });
    }
  }

  return contextByHotelId;
}

function buildOpportunities(signals = []) {
  const signalSet = new Set(signals);
  const opportunities = [];

  if (signalSet.has('LOW_RATING') && signalSet.has('HIGH_REVIEW_VOLUME')) {
    opportunities.push({
      opportunity: 'Low rating with high review volume',
      action: 'Improve reviews',
    });
  }

  if (signalSet.has('NO_CHATBOT')) {
    opportunities.push({
      opportunity: 'No chatbot detected',
      action: 'Install AI concierge',
    });
  }

  if (signalSet.has('OTA_PRESENT')) {
    opportunities.push({
      opportunity: 'OTA presence active',
      action: 'Optimize direct conversion',
    });
  }

  return opportunities;
}

export async function scoreHotelLead(hotel) {
  const signals = [];
  let leadScore = 0;

  const rating = normalizeNumeric(hotel?.rating);
  const reviewCount = normalizeNumeric(hotel?.reviewCount ?? hotel?.review_count);
  const hasChatbot =
    typeof hotel?.hasChatbot === 'boolean'
      ? hotel.hasChatbot
      : typeof hotel?.has_chatbot === 'boolean'
        ? hotel.has_chatbot
        : undefined;
  const otaChannels = hotel?.otaChannels ?? hotel?.ota_channels ?? null;

  if (rating !== null && rating < 4) {
    signals.push('LOW_RATING');
    leadScore += 30;
  }

  if (hasChatbot === false) {
    signals.push('NO_CHATBOT');
    leadScore += 40;
  }

  if (reviewCount !== null && reviewCount > 200) {
    signals.push('HIGH_REVIEW_VOLUME');
    leadScore += 20;
  }

  if (hasOtaChannels(otaChannels)) {
    signals.push('OTA_PRESENT');
    leadScore += 10;
  }

  const opportunities = buildOpportunities(signals);

  return {
    hotelId: hotel?.hotelId ?? hotel?.id ?? null,
    hotelName: hotel?.hotelName ?? hotel?.hotel_name ?? null,
    city: hotel?.city ?? null,
    latitude: normalizeNumeric(hotel?.latitude ?? hotel?.lat),
    longitude: normalizeNumeric(hotel?.longitude ?? hotel?.lng),
    rating,
    reviewCount,
    hasChatbot: hasChatbot ?? null,
    otaChannels,
    leadScore: Math.max(0, Math.min(100, leadScore)),
    signals,
    opportunities,
  };
}

export async function rankHotelLeads(hotels = []) {
  const scored = await Promise.all(hotels.map((hotel) => scoreHotelLead(hotel)));

  return scored
    .map((hotel, index) => ({ hotel, index }))
    .sort((left, right) => {
      const scoreDelta = Number(right.hotel?.leadScore || 0) - Number(left.hotel?.leadScore || 0);
      if (scoreDelta !== 0) return scoreDelta;

      const rightReviewCount = Number.isFinite(Number(right.hotel?.reviewCount))
        ? Number(right.hotel.reviewCount)
        : -1;
      const leftReviewCount = Number.isFinite(Number(left.hotel?.reviewCount))
        ? Number(left.hotel.reviewCount)
        : -1;
      const reviewDelta = rightReviewCount - leftReviewCount;
      if (reviewDelta !== 0) return reviewDelta;

      return left.index - right.index;
    })
    .map(({ hotel }) => hotel);
}

export async function computeLeadSignals(hotels = []) {
  const rankedHotels = await rankHotelLeads(hotels);
  const contextByHotelId = buildContextMaps(rankedHotels);

  return rankedHotels.map((hotel) => ({
    hotelId: hotel.hotelId,
    hotelName: hotel.hotelName,
    city: hotel.city,
    latitude: hotel.latitude ?? null,
    longitude: hotel.longitude ?? null,
    leadScore: hotel.leadScore,
    signals: hotel.signals,
    opportunities: hotel.opportunities,
    context: contextByHotelId.get(hotel.hotelId) || {
      ratingPercentile: null,
      reviewVolumePercentile: null,
      chatbotAdoptionRate: null,
    },
  }));
}
