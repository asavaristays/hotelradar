import { pool } from '../db/pool.js';

export async function insertRevenueBriefDelivery({
  hotelId,
  stayDate = null,
  channel = 'manual',
  status = 'generated',
  pricingAction = null,
  confidenceScore = null,
  trustStatus = null,
  briefText = '',
  modelSnapshot = {},
  generatedBy = null,
  deliveredAt = null,
  deliveryError = null,
  recipientEmail = null,
  subject = null,
  providerMessageId = null,
  providerResponse = {},
}) {
  const { rows } = await pool.query(
    `INSERT INTO revenue_intelligence_brief_deliveries (
       hotel_id,
       stay_date,
       channel,
       status,
       pricing_action,
       confidence_score,
       trust_status,
       brief_text,
       model_snapshot,
       generated_by,
       delivered_at,
       delivery_error,
       recipient_email,
       subject,
       provider_message_id,
       provider_response
     )
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::timestamptz, $12, $13, $14, $15, $16::jsonb)
     RETURNING *`,
    [
      hotelId,
      stayDate,
      channel,
      status,
      pricingAction,
      confidenceScore,
      trustStatus,
      briefText,
      JSON.stringify(modelSnapshot || {}),
      generatedBy,
      deliveredAt,
      deliveryError,
      recipientEmail,
      subject,
      providerMessageId,
      JSON.stringify(providerResponse || {}),
    ],
  );
  return rows[0] || null;
}

export async function updateRevenueBriefDeliveryStatus({
  deliveryId,
  status,
  deliveredAt = null,
  deliveryError = null,
  providerMessageId = null,
  providerResponse = null,
}) {
  const { rows } = await pool.query(
    `UPDATE revenue_intelligence_brief_deliveries
     SET status = $2,
         delivered_at = CASE WHEN $3::timestamptz IS NOT NULL THEN $3::timestamptz ELSE delivered_at END,
         delivery_error = $4,
         provider_message_id = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE provider_message_id END,
         provider_response = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE provider_response END
     WHERE id = $1
     RETURNING *`,
    [
      deliveryId,
      status,
      deliveredAt,
      deliveryError,
      providerMessageId,
      providerResponse == null ? null : JSON.stringify(providerResponse),
    ],
  );
  return rows[0] || null;
}

export async function addRevenueBriefFeedback({
  deliveryId,
  feedbackStatus,
  feedbackNote = '',
  feedbackBy = null,
}) {
  const { rows } = await pool.query(
    `UPDATE revenue_intelligence_brief_deliveries
     SET status = 'reviewed',
         feedback_status = $2,
         feedback_note = $3,
         feedback_by = $4,
         feedback_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, feedbackStatus, feedbackNote || '', feedbackBy],
  );
  return rows[0] || null;
}

export async function listRevenueBriefDeliveries({ hotelId = null, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const values = [safeLimit];
  const hotelFilter = hotelId ? 'WHERE rbd.hotel_id = $2' : '';
  if (hotelId) values.push(hotelId);

  const { rows } = await pool.query(
    `SELECT
       rbd.id,
       rbd.hotel_id,
       h.hotel_name,
       COALESCE(c.name, h.city) AS city,
       rbd.stay_date,
       rbd.channel,
       rbd.status,
       rbd.pricing_action,
       rbd.confidence_score::float8 AS confidence_score,
       rbd.trust_status,
       rbd.recipient_email,
       rbd.subject,
       rbd.brief_text,
       rbd.provider_message_id,
       rbd.provider_response,
       rbd.generated_at,
       rbd.delivered_at,
       rbd.feedback_status,
       rbd.feedback_note,
       rbd.feedback_at
     FROM revenue_intelligence_brief_deliveries rbd
     JOIN hotels h ON h.id = rbd.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     ${hotelFilter}
     ORDER BY rbd.generated_at DESC
     LIMIT $1`,
    values,
  );
  return rows;
}
