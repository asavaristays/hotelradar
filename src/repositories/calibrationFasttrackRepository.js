import { pool } from '../db/pool.js';
import { focusCityKeys } from '../config/productScope.js';

export async function findHotelByNameInCity(city, hotelName) {
  const { rows } = await pool.query(
    `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE LOWER(h.hotel_name) = LOWER($1)
       AND ($2 = '' OR LOWER(COALESCE(c.name, h.city)) = LOWER($2))
     LIMIT 1`,
    [hotelName, city || ''],
  );
  return rows[0] || null;
}

export async function upsertHotelDailyOutcomes(rows) {
  if (!rows.length) return [];

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 7;
    values.push(
      row.hotelId,
      row.outcomeDate,
      row.actualAdr,
      row.occupancyPct,
      row.pickupRooms,
      row.source,
      row.uploadedBy,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  const { rows: inserted } = await pool.query(
    `INSERT INTO hotel_daily_outcomes (
      hotel_id, outcome_date, actual_adr, occupancy_pct, pickup_rooms, source, uploaded_by
    )
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (hotel_id, outcome_date) DO UPDATE
    SET
      actual_adr = EXCLUDED.actual_adr,
      occupancy_pct = EXCLUDED.occupancy_pct,
      pickup_rooms = EXCLUDED.pickup_rooms,
      source = EXCLUDED.source,
      uploaded_by = EXCLUDED.uploaded_by
    RETURNING id, hotel_id, outcome_date, actual_adr, occupancy_pct, pickup_rooms, source, created_at`,
    values,
  );

  return inserted;
}

export async function listOutcomeBootstrapTargets() {
  const { rows } = await pool.query(
    `SELECT
       h.id,
       h.hotel_name,
       COALESCE(c.name, h.city) AS city,
       h.room_count,
       h.base_price_min::float8 AS base_price_min,
       h.base_price_max::float8 AS base_price_max,
       latest_rate.price::float8 AS latest_price,
       NULLIF(
         regexp_replace(COALESCE(latest_demand.recommendation->>'base', ''), '[^0-9.+-]', '', 'g'),
         ''
       )::float8 AS latest_suggested_base
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN LATERAL (
       SELECT hrs.price
       FROM hotel_rate_snapshots hrs
       WHERE hrs.hotel_id = h.id
       ORDER BY hrs.captured_at DESC
       LIMIT 1
     ) latest_rate ON TRUE
     LEFT JOIN LATERAL (
       SELECT ds.recommendation
       FROM demand_scores ds
       WHERE ds.hotel_id = h.id
       ORDER BY ds.created_at DESC
       LIMIT 1
     ) latest_demand ON TRUE
     WHERE COALESCE(h.subscription_status, 'active') IN ('active', 'trial', 'paused')
       AND LOWER(COALESCE(c.name, h.city)) = ANY($1::text[])
     ORDER BY city ASC, h.hotel_name ASC`,
    [focusCityKeys],
  );
  return rows;
}

export async function insertOutcomeBootstrapRows(rows) {
  if (!rows.length) return [];

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 7;
    values.push(
      row.hotelId,
      row.outcomeDate,
      row.actualAdr,
      row.occupancyPct,
      row.pickupRooms,
      row.source,
      row.uploadedBy,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  const { rows: inserted } = await pool.query(
    `INSERT INTO hotel_daily_outcomes (
      hotel_id, outcome_date, actual_adr, occupancy_pct, pickup_rooms, source, uploaded_by
    )
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (hotel_id, outcome_date) DO NOTHING
    RETURNING id, hotel_id, outcome_date, actual_adr, occupancy_pct, pickup_rooms, source, created_at`,
    values,
  );

  return inserted;
}

export async function getCityCalibrationDataset(city, days = 14) {
  const { rows } = await pool.query(
    `SELECT
       o.hotel_id,
       h.hotel_name,
       COALESCE(c.name, h.city) AS city,
       o.outcome_date,
       o.actual_adr::float8 AS actual_adr,
       o.occupancy_pct::float8 AS occupancy_pct,
       o.pickup_rooms,
       ds.id AS demand_id,
       ds.demand_score::float8 AS demand_score,
       ds.level AS demand_level,
       COALESCE(ds.recommendation->>'action', 'maintain') AS recommended_action,
       NULLIF(
         regexp_replace(COALESCE(ds.recommendation->>'base', ''), '[^0-9.+-]', '', 'g'),
         ''
       )::float8 AS suggested_base,
       ds.signals
     FROM hotel_daily_outcomes o
     JOIN hotels h ON h.id = o.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN LATERAL (
       SELECT d.*
       FROM demand_scores d
       WHERE d.hotel_id = o.hotel_id
         AND d.created_at::date <= o.outcome_date
       ORDER BY d.created_at DESC
       LIMIT 1
     ) ds ON TRUE
     WHERE LOWER(COALESCE(c.name, h.city)) = LOWER($1)
       AND o.outcome_date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
     ORDER BY o.hotel_id, o.outcome_date ASC`,
    [city, Number(days || 14)],
  );

  return rows;
}

export async function getCityWeightsForUpdate(city) {
  const { rows } = await pool.query(
    `SELECT city, competitor_weight::float8, holiday_weight::float8, airfare_weight::float8, season_weight::float8
     FROM city_weights
     WHERE LOWER(city) = LOWER($1)
     LIMIT 1`,
    [city],
  );
  return rows[0] || null;
}

export async function getCityByName(city) {
  const { rows } = await pool.query(
    `SELECT id, name
     FROM cities
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [city],
  );
  return rows[0] || null;
}

export async function updateCityWeights(city, weights) {
  const { rows } = await pool.query(
    `UPDATE city_weights
     SET
       competitor_weight = $2,
       holiday_weight = $3,
       airfare_weight = $4,
       season_weight = $5,
       updated_at = NOW()
     WHERE LOWER(city) = LOWER($1)
     RETURNING city, competitor_weight::float8, holiday_weight::float8, airfare_weight::float8, season_weight::float8`,
    [
      city,
      weights.competitor_weight,
      weights.holiday_weight,
      weights.airfare_weight,
      weights.season_weight,
    ],
  );
  return rows[0] || null;
}

export async function listActiveHotelsByCity(city) {
  const { rows } = await pool.query(
    `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE LOWER(COALESCE(c.name, h.city)) = LOWER($1)
       AND h.subscription_status IN ('active', 'trial', 'paused')
     ORDER BY h.id ASC`,
    [city],
  );
  return rows;
}

export async function listEnabledCanaryHotelsByCity(city) {
  const { rows } = await pool.query(
    `SELECT cc.hotel_id, h.hotel_name, COALESCE(c.name, h.city) AS city
     FROM hotel_canary_calibration cc
     JOIN hotels h ON h.id = cc.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE cc.enabled = TRUE
       AND LOWER(COALESCE(c.name, h.city)) = LOWER($1)
     ORDER BY cc.created_at ASC, cc.hotel_id ASC`,
    [city],
  );
  return rows;
}

export async function listOperationalCities() {
  const { rows } = await pool.query(
    `SELECT DISTINCT LOWER(COALESCE(c.name, h.city)) AS city_key, COALESCE(c.name, h.city) AS city
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE h.subscription_status IN ('active', 'trial', 'paused')
     ORDER BY city ASC`,
  );
  return rows.map((row) => row.city);
}

export async function setCanaryOverride({
  hotelId,
  enabled,
  overrideWeights,
  updatedBy,
  modelVersionId = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO hotel_canary_calibration (hotel_id, enabled, override_weights, updated_by, model_version_id)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (hotel_id) DO UPDATE
     SET
       enabled = EXCLUDED.enabled,
       override_weights = EXCLUDED.override_weights,
       updated_by = EXCLUDED.updated_by,
       model_version_id = EXCLUDED.model_version_id,
       updated_at = NOW()
     RETURNING hotel_id, enabled, override_weights, model_version_id, updated_at`,
    [hotelId, Boolean(enabled), JSON.stringify(overrideWeights || {}), updatedBy || null, modelVersionId],
  );
  return rows[0] || null;
}

export async function getCanaryOverride(hotelId) {
  const { rows } = await pool.query(
    `SELECT hotel_id, enabled, override_weights, model_version_id, updated_at
     FROM hotel_canary_calibration
     WHERE hotel_id = $1
     LIMIT 1`,
    [hotelId],
  );
  return rows[0] || null;
}

export async function listCanaryOverrides(city = '') {
  const values = [];
  let where = '';
  if (city) {
    values.push(city);
    where = 'WHERE LOWER(COALESCE(c.name, h.city)) = LOWER($1)';
  }

  const { rows } = await pool.query(
    `SELECT
       cc.hotel_id,
       h.hotel_name,
       COALESCE(c.name, h.city) AS city,
       cc.enabled,
       cc.override_weights,
       cc.model_version_id,
       mv.version_no,
       mv.status AS model_version_status,
       cc.updated_at
     FROM hotel_canary_calibration cc
     JOIN hotels h ON h.id = cc.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN model_versions mv ON mv.version_id = cc.model_version_id
     ${where}
     ORDER BY cc.updated_at DESC`,
    values,
  );
  return rows;
}

export async function createModelVersion({
  cityId,
  weightSnapshot,
  parentVersion = null,
  calibrationRunId = null,
  status = 'canary',
  accuracyBaseline = null,
  metadata = {},
}) {
  const { rows } = await pool.query(
    `WITH next_ver AS (
       SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no
       FROM model_versions
       WHERE city_id = $1
     )
     INSERT INTO model_versions (
       city_id, version_no, weight_snapshot_json, parent_version, calibration_run_id, status, accuracy_baseline, metadata
     )
     SELECT $1, nv.version_no, $2::jsonb, $3, $4, $5, $6, $7::jsonb
     FROM next_ver nv
     RETURNING *`,
    [
      cityId,
      JSON.stringify(weightSnapshot || {}),
      parentVersion,
      calibrationRunId,
      status,
      accuracyBaseline,
      JSON.stringify(metadata || {}),
    ],
  );
  return rows[0] || null;
}

export async function linkModelVersionToRun(versionId, calibrationRunId) {
  const { rows } = await pool.query(
    `UPDATE model_versions
     SET calibration_run_id = $2
     WHERE version_id = $1
     RETURNING *`,
    [versionId, calibrationRunId],
  );
  return rows[0] || null;
}

export async function getLatestCanaryModelVersionForCity(cityId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM model_versions
     WHERE city_id = $1
       AND status = 'canary'
     ORDER BY created_at DESC
     LIMIT 1`,
    [cityId],
  );
  return rows[0] || null;
}

export async function getLatestActiveOrCanaryModelVersionForCity(cityId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM model_versions
     WHERE city_id = $1
       AND status IN ('active', 'canary')
     ORDER BY created_at DESC
     LIMIT 1`,
    [cityId],
  );
  return rows[0] || null;
}

export async function getPreviousModelVersionForCity(cityId, currentVersionNo) {
  const { rows } = await pool.query(
    `SELECT *
     FROM model_versions
     WHERE city_id = $1
       AND version_no < $2
       AND status IN ('active', 'canary')
     ORDER BY version_no DESC
     LIMIT 1`,
    [cityId, Number(currentVersionNo)],
  );
  return rows[0] || null;
}

export async function getModelVersionById(versionId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM model_versions
     WHERE version_id = $1
     LIMIT 1`,
    [versionId],
  );
  return rows[0] || null;
}

export async function updateModelVersionStatus(versionId, status, metadataPatch = {}) {
  const { rows } = await pool.query(
    `UPDATE model_versions
     SET
       status = $2,
       metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
       reverted_at = CASE WHEN $2 = 'reverted' THEN NOW() ELSE reverted_at END
     WHERE version_id = $1
     RETURNING *`,
    [versionId, status, JSON.stringify(metadataPatch || {})],
  );
  return rows[0] || null;
}

export async function updateModelVersionAccuracy(versionId, accuracyLatest) {
  const { rows } = await pool.query(
    `UPDATE model_versions
     SET accuracy_latest = $2
     WHERE version_id = $1
     RETURNING *`,
    [versionId, accuracyLatest],
  );
  return rows[0] || null;
}

export async function upsertAlertFeedback({ alertId, feedback, note, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO alert_feedback (alert_id, hotel_id, feedback, note, created_by)
     SELECT a.id, a.hotel_id, $2, $3, $4
     FROM alerts a
     WHERE a.id = $1
     ON CONFLICT (alert_id) DO UPDATE
     SET
       feedback = EXCLUDED.feedback,
       note = EXCLUDED.note,
       created_by = EXCLUDED.created_by,
       created_at = NOW()
     RETURNING id, alert_id, hotel_id, feedback, note, created_at`,
    [alertId, feedback, note || '', createdBy || null],
  );
  return rows[0] || null;
}

export async function getAlertFeedbackRate(city, days = 14) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_feedback,
       COUNT(*) FILTER (WHERE af.feedback = 'useful')::int AS useful_feedback
     FROM alert_feedback af
     JOIN hotels h ON h.id = af.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE LOWER(COALESCE(c.name, h.city)) = LOWER($1)
       AND af.created_at >= NOW() - ($2::int * INTERVAL '1 day')`,
    [city, Number(days || 14)],
  );
  return rows[0] || { total_feedback: 0, useful_feedback: 0 };
}

export async function insertCalibrationRun(payload) {
  const { rows } = await pool.query(
    `INSERT INTO calibration_runs (
      scope_type,
      scope_value,
      status,
      metrics,
      old_weights,
      new_weights,
      proposed_weights,
      applied_weights,
      clamped_weights,
      outcome_sample_size,
      version_created,
      revert_flag,
      accuracy_before,
      accuracy_after,
      notes,
      triggered_by
    ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *`,
    [
      payload.scopeType,
      payload.scopeValue,
      payload.status,
      JSON.stringify(payload.metrics || {}),
      JSON.stringify(payload.oldWeights || {}),
      JSON.stringify(payload.newWeights || {}),
      JSON.stringify(payload.proposedWeights || {}),
      JSON.stringify(payload.appliedWeights || {}),
      JSON.stringify(payload.clampedWeights || {}),
      Number(payload.outcomeSampleSize || 0),
      Boolean(payload.versionCreated),
      Boolean(payload.revertFlag),
      payload.accuracyBefore == null ? null : Number(payload.accuracyBefore),
      payload.accuracyAfter == null ? null : Number(payload.accuracyAfter),
      payload.notes || '',
      payload.triggeredBy || null,
    ],
  );
  return rows[0];
}

export async function listCalibrationRuns(limit = 50) {
  const { rows } = await pool.query(
    `SELECT *
     FROM calibration_runs
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(200, Number(limit || 50)))],
  );
  return rows;
}
