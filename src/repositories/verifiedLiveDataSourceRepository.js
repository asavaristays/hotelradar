import { pool } from '../db/pool.js';

export async function upsertVerifiedLiveDataSource({
  hotelId = null,
  city = null,
  sourceType,
  sourceName,
  adapterType = 'json_manifest',
  sourceUrl,
  enabled = true,
  cadenceMinutes = 60,
  proofRequired = false,
  freshnessMinutes = 120,
  metadata = {},
}) {
  const existing = await pool.query(
    `SELECT id
     FROM verified_live_data_sources
     WHERE COALESCE(hotel_id::text, '') = COALESCE($1::text, '')
       AND lower(source_type) = lower($2)
       AND lower(source_name) = lower($3)
       AND lower(adapter_type) = lower($4)
       AND source_url = $5
     LIMIT 1`,
    [hotelId || null, sourceType, sourceName, adapterType, sourceUrl],
  );

  if (existing.rows[0]?.id) {
    const { rows } = await pool.query(
      `UPDATE verified_live_data_sources
       SET city = $2,
           enabled = $3,
           cadence_minutes = $4,
           proof_required = $5,
           freshness_minutes = $6,
           metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        city || null,
        Boolean(enabled),
        Number(cadenceMinutes || 60),
        Boolean(proofRequired),
        Number(freshnessMinutes || 120),
        JSON.stringify(metadata || {}),
      ],
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `INSERT INTO verified_live_data_sources (
       hotel_id,
       city,
       source_type,
       source_name,
       adapter_type,
       source_url,
       enabled,
       cadence_minutes,
       proof_required,
       freshness_minutes,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING *`,
    [
      hotelId || null,
      city || null,
      sourceType,
      sourceName,
      adapterType,
      sourceUrl,
      Boolean(enabled),
      Number(cadenceMinutes || 60),
      Boolean(proofRequired),
      Number(freshnessMinutes || 120),
      JSON.stringify(metadata || {}),
    ],
  );
  return rows[0] || null;
}

export async function listEnabledVerifiedLiveDataSources({ hotelId = null } = {}) {
  const values = [];
  const hotelFilter = hotelId ? 'AND (s.hotel_id = $1 OR s.hotel_id IS NULL)' : '';
  if (hotelId) values.push(hotelId);

  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.hotel_id,
       h.hotel_name,
       COALESCE(c.name, h.city, s.city) AS city,
       s.source_type,
       s.source_name,
       s.adapter_type,
       s.source_url,
       s.enabled,
       s.cadence_minutes,
       s.proof_required,
       s.freshness_minutes,
       s.metadata,
       s.last_checked_at,
       s.last_status,
       s.last_error
     FROM verified_live_data_sources s
     LEFT JOIN hotels h ON h.id = s.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE s.enabled = TRUE
       ${hotelFilter}
       AND (
         s.last_checked_at IS NULL
         OR s.last_checked_at <= NOW() - make_interval(mins => s.cadence_minutes)
       )
     ORDER BY s.source_type, s.source_name`,
    values,
  );
  return rows;
}

export async function updateVerifiedLiveDataSourceHealth({
  sourceId,
  status,
  errorMessage = null,
  metadata = {},
}) {
  const { rows } = await pool.query(
    `UPDATE verified_live_data_sources
     SET last_checked_at = NOW(),
         last_status = $2,
         last_error = $3,
         metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sourceId, status, errorMessage, JSON.stringify(metadata || {})],
  );
  return rows[0] || null;
}
