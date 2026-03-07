import { pool } from '../db/pool.js';

export async function upsertPerformance(payload) {
  const {
    hotelId,
    directionAccuracy,
    alertPrecision,
    positionImprovementPct,
    rollingAccuracy30d,
    stabilityDeviation,
    sampleSize,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO intelligence_performance (
      hotel_id,
      direction_accuracy,
      alert_precision,
      position_improvement_pct,
      rolling_accuracy_30d,
      stability_deviation,
      sample_size
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (hotel_id) DO UPDATE
    SET direction_accuracy = EXCLUDED.direction_accuracy,
        alert_precision = EXCLUDED.alert_precision,
        position_improvement_pct = EXCLUDED.position_improvement_pct,
        rolling_accuracy_30d = EXCLUDED.rolling_accuracy_30d,
        stability_deviation = EXCLUDED.stability_deviation,
        sample_size = EXCLUDED.sample_size,
        updated_at = NOW()
    RETURNING *`,
    [
      hotelId,
      directionAccuracy,
      alertPrecision,
      positionImprovementPct,
      rollingAccuracy30d,
      stabilityDeviation,
      sampleSize,
    ],
  );

  return rows[0];
}

export async function getPerformance(hotelId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM intelligence_performance
     WHERE hotel_id = $1
     LIMIT 1`,
    [hotelId],
  );
  return rows[0] || null;
}

function directionFromAction(action = '') {
  const normalized = String(action || '').toLowerCase();
  if (normalized === 'increase') return 'up';
  if (normalized === 'reduce') return 'down';
  return 'stable';
}

function directionFromPct(deltaPct) {
  const value = Number(deltaPct || 0);
  if (value > 1) return 'up';
  if (value < -1) return 'down';
  return 'stable';
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export async function getValidatedPerformance(hotelId, days = 60) {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.outcome_date,
         o.actual_adr::float8 AS actual_adr,
         COALESCE(ds.recommendation->>'action', 'maintain') AS recommended_action,
         (ds.recommendation->>'base')::float8 AS suggested_base
       FROM hotel_daily_outcomes o
       LEFT JOIN LATERAL (
         SELECT d.recommendation
         FROM demand_scores d
         WHERE d.hotel_id = o.hotel_id
           AND d.created_at::date <= o.outcome_date
         ORDER BY d.created_at DESC
         LIMIT 1
       ) ds ON TRUE
       WHERE o.hotel_id = $1
         AND o.outcome_date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
       ORDER BY o.outcome_date ASC`,
      [hotelId, Number.isFinite(Number(days)) ? Number(days) : 60],
    );

    if (!rows.length) {
      return null;
    }

    const validRows = rows.filter((row) => Number(row.actual_adr || 0) > 0 && Number(row.suggested_base || 0) > 0);
    const sampleSize = validRows.length;

    let directionSamples = 0;
    let directionMatches = 0;
    for (let i = 0; i < rows.length - 1; i += 1) {
      const current = rows[i];
      const next = rows[i + 1];
      const currentAdr = Number(current.actual_adr || 0);
      const nextAdr = Number(next.actual_adr || 0);
      if (currentAdr <= 0 || nextAdr <= 0) continue;

      const actualDirection = directionFromPct(((nextAdr - currentAdr) / currentAdr) * 100);
      const predictedDirection = directionFromAction(current.recommended_action);
      directionSamples += 1;
      if (actualDirection === predictedDirection) directionMatches += 1;
    }

    const directionAccuracy = directionSamples ? (directionMatches / directionSamples) * 100 : 0;

    let mapeSum = 0;
    for (const row of validRows) {
      const actual = Number(row.actual_adr || 0);
      const suggested = Number(row.suggested_base || 0);
      mapeSum += Math.abs(suggested - actual) / actual;
    }
    const mape = sampleSize ? (mapeSum / sampleSize) * 100 : 0;

    const latestDate = rows[rows.length - 1]?.outcome_date || null;
    return {
      directionAccuracy: round(directionAccuracy, 2),
      rollingAccuracy30d: round(directionAccuracy, 2),
      stabilityDeviation: round(mape, 2),
      sampleSize,
      directionSamples,
      updatedAt: latestDate ? new Date(`${latestDate}T00:00:00.000Z`).toISOString() : null,
      source: 'validated_outcomes',
    };
  } catch (error) {
    if (error?.code === '42P01') {
      // Graceful fallback when fast-track calibration tables are not present yet.
      return null;
    }
    throw error;
  }
}
