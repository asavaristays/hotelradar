import { pool } from '../db/pool.js';

export async function enqueueRecalcJob({
  hotelId,
  payload = {},
  requestedBy = null,
  source = 'api',
  priority = 100,
  maxAttempts = 3,
}) {
  const { rows } = await pool.query(
    `INSERT INTO recalc_jobs (
       hotel_id, payload, requested_by, source, priority, max_attempts
     )
     VALUES ($1, $2::jsonb, $3, $4, $5, $6)
     RETURNING *`,
    [
      hotelId,
      JSON.stringify(payload || {}),
      requestedBy,
      source,
      Number(priority || 100),
      Number(maxAttempts || 3),
    ],
  );
  return rows[0] || null;
}

export async function getRecalcJobById(jobId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM recalc_jobs
     WHERE id = $1
     LIMIT 1`,
    [jobId],
  );
  return rows[0] || null;
}

export async function claimNextRecalcJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `WITH next_job AS (
         SELECT id
         FROM recalc_jobs
         WHERE status = 'queued'
           AND not_before <= NOW()
         ORDER BY priority ASC, created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE recalc_jobs r
       SET
         status = 'processing',
         attempts = r.attempts + 1,
         started_at = NOW(),
         updated_at = NOW()
       FROM next_job
       WHERE r.id = next_job.id
       RETURNING r.*`,
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeRecalcJob(jobId, resultSnapshot = {}) {
  const { rows } = await pool.query(
    `UPDATE recalc_jobs
     SET
       status = 'completed',
       finished_at = NOW(),
       error_message = NULL,
       result_snapshot = $2::jsonb,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, JSON.stringify(resultSnapshot || {})],
  );
  return rows[0] || null;
}

export async function failRecalcJob({
  jobId,
  attempts,
  maxAttempts,
  retryAfterSeconds,
  errorMessage,
}) {
  const shouldRetry = Number(attempts || 0) < Number(maxAttempts || 0);
  const { rows } = await pool.query(
    `UPDATE recalc_jobs
     SET
       status = $2,
       not_before = CASE
         WHEN $2 = 'queued' THEN NOW() + make_interval(secs => $3::int)
         ELSE not_before
       END,
       finished_at = CASE
         WHEN $2 = 'failed' THEN NOW()
         ELSE finished_at
       END,
       error_message = $4,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      jobId,
      shouldRetry ? 'queued' : 'failed',
      Number(retryAfterSeconds || 0),
      String(errorMessage || 'Recalculation failed.'),
    ],
  );
  return rows[0] || null;
}
