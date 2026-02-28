import { pool } from '../db/pool.js';

export async function insertAuditLog(payload) {
  const {
    hotelId = null,
    userId = null,
    triggerSource,
    executionMs,
    engineVersion,
    resultHash,
    metadata = {},
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO intelligence_audit_log (
      hotel_id, user_id, trigger_source, execution_ms, engine_version, result_hash, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    RETURNING *`,
    [hotelId, userId, triggerSource, executionMs, engineVersion, resultHash, JSON.stringify(metadata)],
  );

  return rows[0];
}

export async function listAuditLogs(limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, hotel_id, user_id, trigger_source, execution_ms, engine_version, result_hash, metadata, created_at
     FROM intelligence_audit_log
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

