import { pool } from '../db/pool.js';
import { focusCityKeys } from '../config/productScope.js';

export async function createRealtimeSignalRun({ source = 'realtime-capture', cadence = 'manual' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO realtime_signal_runs (source, cadence)
     VALUES ($1, $2)
     RETURNING *`,
    [source, cadence],
  );
  return rows[0] || null;
}

export async function finishRealtimeSignalRun({ runId, status, summary = {}, errorMessage = null }) {
  const { rows } = await pool.query(
    `UPDATE realtime_signal_runs
     SET status = $2,
         completed_at = NOW(),
         summary = $3::jsonb,
         error_message = $4
     WHERE id = $1
     RETURNING *`,
    [runId, status, JSON.stringify(summary || {}), errorMessage],
  );
  return rows[0] || null;
}

export async function insertRealtimeSignalObservation(observation) {
  const { rows } = await pool.query(
    `INSERT INTO realtime_signal_observations (
       run_id,
       hotel_id,
       city,
       checkin_date,
       source_type,
       source_name,
       signal_type,
       value_numeric,
       value_text,
       currency,
       proof_url,
       confidence_score,
       observed_at,
       freshness_expires_at,
       metadata
     )
     VALUES (
       $1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12,
       COALESCE($13::timestamptz, NOW()),
       COALESCE($14::timestamptz, NOW() + INTERVAL '2 hours'),
       $15::jsonb
     )
     RETURNING *`,
    [
      observation.runId || null,
      observation.hotelId || null,
      observation.city,
      observation.checkinDate || null,
      observation.sourceType,
      observation.sourceName,
      observation.signalType,
      observation.valueNumeric ?? null,
      observation.valueText || null,
      observation.currency || 'INR',
      observation.proofUrl || null,
      Number(observation.confidenceScore || 70),
      observation.observedAt || null,
      observation.freshnessExpiresAt || null,
      JSON.stringify(observation.metadata || {}),
    ],
  );
  return rows[0] || null;
}

export async function listLatestRateEvidence({ hotelId = null, limit = 200 } = {}) {
  const values = [focusCityKeys, Math.max(1, Math.min(500, Number(limit || 200)))];
  const hotelFilter = hotelId ? 'AND h.id = $3' : '';
  if (hotelId) values.push(hotelId);

  const { rows } = await pool.query(
    `WITH scoped_hotels AS (
       SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
       FROM hotels h
       LEFT JOIN cities c ON c.id = h.city_id
       WHERE COALESCE(h.subscription_status, 'active') = 'active'
         AND lower(COALESCE(c.name, h.city)) = ANY($1::text[])
         ${hotelFilter}
     ),
     hotel_rates AS (
       SELECT DISTINCT ON (hrs.hotel_id, hrs.checkin_date)
         hrs.hotel_id,
         sh.city,
         hrs.checkin_date,
         'official'::text AS source_type,
         sh.hotel_name AS source_name,
         'hotel_rate'::text AS signal_type,
         hrs.price::float8 AS value_numeric,
         NULL::text AS proof_url,
         hrs.captured_at AS observed_at,
         jsonb_build_object('source_table', 'hotel_rate_snapshots') AS metadata
       FROM hotel_rate_snapshots hrs
       JOIN scoped_hotels sh ON sh.id = hrs.hotel_id
       WHERE hrs.checkin_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
       ORDER BY hrs.hotel_id, hrs.checkin_date, hrs.captured_at DESC
     ),
     competitor_rates_ranked AS (
       SELECT DISTINCT ON (cr.hotel_id, cr.competitor_id, cr.checkin_date)
         cr.hotel_id,
         sh.city,
         cr.checkin_date,
         CASE
           WHEN COALESCE(comp.competitor_name, '') ~* '(booking|agoda|makemytrip|mmt|goibibo|expedia|trip\\.?com|tripadvisor)'
             OR COALESCE(COALESCE(comp.url, comp.website_url), '') ~* '(booking|agoda|makemytrip|goibibo|expedia|trip\\.?com|tripadvisor)'
           THEN 'ota'
           ELSE 'competitor'
         END AS source_type,
         comp.competitor_name AS source_name,
         CASE
           WHEN COALESCE(comp.competitor_name, '') ~* '(booking|agoda|makemytrip|mmt|goibibo|expedia|trip\\.?com|tripadvisor)'
             OR COALESCE(COALESCE(comp.url, comp.website_url), '') ~* '(booking|agoda|makemytrip|goibibo|expedia|trip\\.?com|tripadvisor)'
           THEN 'ota_rate'
           ELSE 'competitor_rate'
         END AS signal_type,
         cr.price_today::float8 AS value_numeric,
         COALESCE(comp.url, comp.website_url) AS proof_url,
         cr.scraped_at AS observed_at,
         jsonb_build_object(
           'source_table', 'competitor_rates',
           'competitor_id', comp.id,
           'price_48h_ago', cr.price_48h_ago
         ) AS metadata
       FROM competitor_rates cr
       JOIN scoped_hotels sh ON sh.id = cr.hotel_id
       JOIN competitors comp ON comp.id = cr.competitor_id
       WHERE cr.checkin_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
       ORDER BY cr.hotel_id, cr.competitor_id, cr.checkin_date, cr.scraped_at DESC
     )
     SELECT * FROM hotel_rates
     UNION ALL
     SELECT * FROM competitor_rates_ranked
     ORDER BY observed_at DESC
     LIMIT $2`,
    values,
  );
  return rows;
}

export async function getRealtimeSignalSummary(hotelId, { checkinDate = null, horizonDays = 15, limit = 120 } = {}) {
  const values = [hotelId, Math.max(1, Math.min(200, Number(limit || 120)))];
  const safeHorizonDays = Math.max(1, Math.min(31, Number(horizonDays || 15)));
  const dateFilter = checkinDate
    ? `AND checkin_date >= $3::date
       AND checkin_date < $3::date + make_interval(days => $4::integer)`
    : '';
  if (checkinDate) values.push(checkinDate, safeHorizonDays);

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (source_type, source_name, signal_type, checkin_date)
       source_type,
       source_name,
       signal_type,
       checkin_date,
       value_numeric::float8 AS value_numeric,
       value_text,
       currency,
       proof_url,
       confidence_score::float8 AS confidence_score,
       observed_at,
       captured_at,
       freshness_expires_at,
       metadata
     FROM realtime_signal_observations
     WHERE hotel_id = $1
       ${dateFilter}
     ORDER BY source_type, source_name, signal_type, checkin_date, captured_at DESC
     LIMIT $2`,
    values,
  );

  const latestCapturedAt = rows.reduce((latest, row) => {
    const ts = row.captured_at ? new Date(row.captured_at).getTime() : 0;
    return ts > latest ? ts : latest;
  }, 0);
  const now = Date.now();
  const freshRows = rows.filter((row) => {
    const expiresAt = row.freshness_expires_at ? new Date(row.freshness_expires_at).getTime() : 0;
    return expiresAt > now;
  });

  return {
    status: freshRows.length ? 'fresh' : rows.length ? 'stale' : 'missing',
    latestCapturedAt: latestCapturedAt ? new Date(latestCapturedAt).toISOString() : null,
    rows: rows.map((row) => ({
      sourceType: row.source_type,
      sourceName: row.source_name,
      signalType: row.signal_type,
      checkinDate: row.checkin_date ? new Date(row.checkin_date).toISOString().slice(0, 10) : null,
      valueNumeric: row.value_numeric == null ? null : Number(row.value_numeric),
      valueText: row.value_text || '',
      currency: row.currency || 'INR',
      proofUrl: row.proof_url || '',
      confidenceScore: Number(row.confidence_score || 0),
      observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
      capturedAt: row.captured_at ? new Date(row.captured_at).toISOString() : null,
      freshnessExpiresAt: row.freshness_expires_at ? new Date(row.freshness_expires_at).toISOString() : null,
      metadata: row.metadata || {},
    })),
    counts: {
      official: rows.filter((row) => row.source_type === 'official').length,
      ota: rows.filter((row) => row.source_type === 'ota').length,
      competitor: rows.filter((row) => row.source_type === 'competitor').length,
      fresh: freshRows.length,
      airfare: rows.filter((row) => row.source_type === 'airfare').length,
      search: rows.filter((row) => row.source_type === 'search').length,
      event: rows.filter((row) => row.source_type === 'event').length,
      weather: rows.filter((row) => row.source_type === 'weather').length,
      digital: rows.filter((row) => row.source_type === 'digital').length,
      pms: rows.filter((row) => row.source_type === 'pms').length,
      review: rows.filter((row) => row.source_type === 'review').length,
      social: rows.filter((row) => row.source_type === 'social').length,
      total: rows.length,
    },
  };
}
