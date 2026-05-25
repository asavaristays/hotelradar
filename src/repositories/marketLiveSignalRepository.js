import { pool } from '../db/pool.js';

function toBatchRows(rows = [], batchSize = 50) {
  const size = Math.max(1, Number(batchSize || 50));
  const batches = [];

  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }

  return batches;
}

async function upsertMarketLiveSignalsBatch(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 13;
    values.push(
      row.externalKey,
      row.city,
      row.signalType,
      row.source,
      row.sourceRef,
      row.title,
      row.description,
      row.recommendedAction,
      row.impactScore,
      row.confidenceScore,
      row.status,
      row.observedAt,
      JSON.stringify(row.metadata || {}),
    );

    return `(
      $${offset + 1}::text,
      $${offset + 2}::text,
      $${offset + 3}::text,
      $${offset + 4}::text,
      $${offset + 5}::text,
      $${offset + 6}::text,
      $${offset + 7}::text,
      $${offset + 8}::text,
      $${offset + 9}::numeric(6,2),
      $${offset + 10}::numeric(6,2),
      $${offset + 11}::text,
      $${offset + 12}::timestamptz,
      $${offset + 13}::jsonb
    )`;
  });

  const result = await pool.query(
    `INSERT INTO market_live_signals (
       external_key,
       city,
       signal_type,
       source,
       source_ref,
       title,
       description,
       recommended_action,
       impact_score,
       confidence_score,
       status,
       observed_at,
       metadata,
       fresh_until,
       released_at,
       expired_at,
       updated_at
     )
     SELECT
       input_rows.external_key,
       input_rows.city,
       input_rows.signal_type,
       input_rows.source,
       input_rows.source_ref,
       input_rows.title,
       input_rows.description,
       input_rows.recommended_action,
       input_rows.impact_score,
       input_rows.confidence_score,
       input_rows.status,
       input_rows.observed_at,
       input_rows.metadata,
       CASE input_rows.signal_type
         WHEN 'WEDDING_DEMAND_ZONE' THEN input_rows.observed_at + INTERVAL '7 days'
         WHEN 'EVENT_DEMAND_ZONE' THEN input_rows.observed_at + INTERVAL '72 hours'
         WHEN 'CORPORATE_EVENT_CLUSTER' THEN input_rows.observed_at + INTERVAL '72 hours'
         WHEN 'FESTIVAL_DEMAND' THEN input_rows.observed_at + INTERVAL '7 days'
         WHEN 'AIRPORT_DEMAND' THEN input_rows.observed_at + INTERVAL '24 hours'
         WHEN 'TOURISM_SPIKE' THEN input_rows.observed_at + INTERVAL '48 hours'
         WHEN 'PRICE_PRESSURE' THEN input_rows.observed_at + INTERVAL '24 hours'
         WHEN 'OTA_DEPENDENCE' THEN input_rows.observed_at + INTERVAL '48 hours'
         WHEN 'WEEKEND_COMPRESSION' THEN input_rows.observed_at + INTERVAL '72 hours'
         ELSE input_rows.observed_at + INTERVAL '48 hours'
       END,
       CASE WHEN input_rows.status = 'released' THEN NOW() ELSE NULL END,
       NULL,
       NOW()
     FROM (
       VALUES ${placeholders.join(', ')}
     ) AS input_rows (
       external_key,
       city,
       signal_type,
       source,
       source_ref,
       title,
       description,
       recommended_action,
       impact_score,
       confidence_score,
       status,
       observed_at,
       metadata
     )
     ON CONFLICT (external_key) DO UPDATE
     SET city = EXCLUDED.city,
         signal_type = EXCLUDED.signal_type,
         source = EXCLUDED.source,
         source_ref = EXCLUDED.source_ref,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         recommended_action = EXCLUDED.recommended_action,
         impact_score = EXCLUDED.impact_score,
         confidence_score = EXCLUDED.confidence_score,
         status = EXCLUDED.status,
         observed_at = EXCLUDED.observed_at,
         metadata = EXCLUDED.metadata,
         fresh_until = EXCLUDED.fresh_until,
         released_at = CASE
           WHEN EXCLUDED.status = 'released' THEN NOW()
           ELSE market_live_signals.released_at
         END,
         expired_at = CASE
           WHEN EXCLUDED.status = 'expired' THEN NOW()
           ELSE NULL
         END,
         updated_at = NOW()`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function upsertMarketLiveSignals(rows = [], { batchSize = 50 } = {}) {
  let rowCount = 0;
  for (const batch of toBatchRows(rows, batchSize)) {
    const result = await upsertMarketLiveSignalsBatch(batch);
    rowCount += Number(result?.rowCount || 0);
  }
  return { rowCount };
}

export async function expireMarketLiveSignals({ city = null } = {}) {
  const values = [];
  const filters = [`status IN ('raw', 'staged', 'released')`, 'fresh_until <= NOW()'];

  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }

  const result = await pool.query(
    `UPDATE market_live_signals
     SET status = 'expired',
         expired_at = NOW(),
         updated_at = NOW()
     WHERE ${filters.join(' AND ')}`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function listReleasedMarketLiveSignals(city, { limit = 200 } = {}) {
  const values = [city, Math.max(1, Number(limit || 200))];
  const { rows } = await pool.query(
    `SELECT
       id,
       city,
       signal_type,
       source,
       source_ref,
       title,
       description,
       recommended_action,
       impact_score,
       confidence_score,
       status,
       observed_at,
       released_at,
       fresh_until,
       metadata
     FROM market_live_signals
     WHERE city = $1
       AND status = 'released'
       AND fresh_until > NOW()
     ORDER BY impact_score DESC, confidence_score DESC, observed_at DESC
     LIMIT $2`,
    values,
  );

  return rows.map((row) => ({
    id: String(row.id),
    city: row.city,
    signalType: row.signal_type,
    source: row.source,
    sourceRef: row.source_ref,
    title: row.title,
    description: row.description,
    recommendedAction: row.recommended_action,
    impactScore: Number(row.impact_score || 0),
    confidenceScore: Number(row.confidence_score || 0),
    status: row.status,
    observedAt: row.observed_at,
    releasedAt: row.released_at,
    freshUntil: row.fresh_until,
    metadata: row.metadata || {},
  }));
}

export async function getLatestReleasedMarketLiveSignalAt(city) {
  const { rows } = await pool.query(
    `SELECT MAX(released_at) AS released_at
     FROM market_live_signals
     WHERE city = $1
       AND status = 'released'`,
    [city],
  );

  return rows[0]?.released_at || null;
}
