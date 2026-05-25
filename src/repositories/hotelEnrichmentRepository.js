import { pool } from '../db/pool.js';

export async function getHotelEnrichmentByHotelId(hotelId) {
  try {
    const { rows } = await pool.query(
      `SELECT
         hotel_id,
         public_rating,
         review_count,
         rating_source,
         review_source,
         has_chatbot,
         chatbot_provider,
         ota_channels,
         rating_last_checked_at,
         review_last_checked_at,
         chatbot_detected_at,
         ota_presence_last_checked_at,
         created_at,
         updated_at
       FROM hotel_enrichment
       WHERE hotel_id = $1
       LIMIT 1`,
      [hotelId],
    );

    return rows[0] || null;
  } catch (error) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

export async function listHotelEnrichmentByHotelIds(hotelIds = []) {
  const ids = Array.isArray(hotelIds)
    ? hotelIds.filter((hotelId) => typeof hotelId === 'string' && hotelId.trim())
    : [];

  if (!ids.length) return [];

  try {
    const { rows } = await pool.query(
      `SELECT
         hotel_id,
         public_rating,
         review_count,
         rating_source,
         review_source,
         has_chatbot,
         chatbot_provider,
         ota_channels,
         rating_last_checked_at,
         review_last_checked_at,
         chatbot_detected_at,
         ota_presence_last_checked_at,
         created_at,
         updated_at
       FROM hotel_enrichment
       WHERE hotel_id = ANY($1::uuid[])`,
      [ids],
    );

    return rows;
  } catch (error) {
    if (error?.code === '42P01') return [];
    throw error;
  }
}

export async function upsertHotelEnrichment({
  hotelId,
  publicRating = null,
  reviewCount = null,
  ratingSource = null,
  reviewSource = null,
  hasChatbot = null,
  chatbotProvider = null,
  otaChannels = null,
  ratingLastCheckedAt = null,
  reviewLastCheckedAt = null,
  chatbotDetectedAt = null,
  otaPresenceLastCheckedAt = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO hotel_enrichment (
       hotel_id,
       public_rating,
       review_count,
       rating_source,
       review_source,
       has_chatbot,
       chatbot_provider,
       ota_channels,
       rating_last_checked_at,
       review_last_checked_at,
       chatbot_detected_at,
       ota_presence_last_checked_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12
     )
     ON CONFLICT (hotel_id) DO UPDATE
     SET
       public_rating = EXCLUDED.public_rating,
       review_count = EXCLUDED.review_count,
       rating_source = EXCLUDED.rating_source,
       review_source = EXCLUDED.review_source,
       has_chatbot = EXCLUDED.has_chatbot,
       chatbot_provider = EXCLUDED.chatbot_provider,
       ota_channels = EXCLUDED.ota_channels,
       rating_last_checked_at = EXCLUDED.rating_last_checked_at,
       review_last_checked_at = EXCLUDED.review_last_checked_at,
       chatbot_detected_at = EXCLUDED.chatbot_detected_at,
       ota_presence_last_checked_at = EXCLUDED.ota_presence_last_checked_at,
       updated_at = NOW()
     RETURNING
       hotel_id,
       public_rating,
       review_count,
       rating_source,
       review_source,
       has_chatbot,
       chatbot_provider,
       ota_channels,
       rating_last_checked_at,
       review_last_checked_at,
       chatbot_detected_at,
       ota_presence_last_checked_at,
       created_at,
       updated_at`,
    [
      hotelId,
      publicRating,
      reviewCount,
      ratingSource,
      reviewSource,
      hasChatbot,
      chatbotProvider,
      otaChannels == null ? null : JSON.stringify(otaChannels),
      ratingLastCheckedAt,
      reviewLastCheckedAt,
      chatbotDetectedAt,
      otaPresenceLastCheckedAt,
    ],
  );

  return rows[0] || null;
}
