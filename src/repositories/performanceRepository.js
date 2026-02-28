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

