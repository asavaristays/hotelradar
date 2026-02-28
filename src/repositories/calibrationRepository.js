import { pool } from '../db/pool.js';

export async function getCalibrationRows() {
  const { rows } = await pool.query(
    `SELECT key, value_json
     FROM calibration_settings
     ORDER BY key ASC`,
  );
  return rows;
}

export async function upsertCalibrationSetting(key, valueJson) {
  const { rows } = await pool.query(
    `INSERT INTO calibration_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE
     SET value_json = EXCLUDED.value_json,
         updated_at = NOW()
     RETURNING key, value_json, updated_at`,
    [key, JSON.stringify(valueJson)],
  );
  return rows[0];
}
