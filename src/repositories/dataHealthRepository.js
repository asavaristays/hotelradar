import { pool } from '../db/pool.js';

export async function upsertDataHealthIssue({
  hotelId,
  issueCode,
  title,
  severity,
  message,
  metadata = {},
  detectedAt = new Date(),
}) {
  const { rows } = await pool.query(
    `INSERT INTO data_health_issues (
       hotel_id,
       issue_code,
       title,
       severity,
       status,
       message,
       metadata,
       first_detected_at,
       last_detected_at,
       updated_at
     )
     VALUES ($1,$2,$3,$4,'open',$5,$6::jsonb,$7,$7,$7)
     ON CONFLICT (hotel_id, issue_code) DO UPDATE
     SET
       title = EXCLUDED.title,
       severity = EXCLUDED.severity,
       status = 'open',
       message = EXCLUDED.message,
       metadata = EXCLUDED.metadata,
       last_detected_at = EXCLUDED.last_detected_at,
       resolved_at = NULL,
       reopen_count = CASE
         WHEN data_health_issues.status = 'resolved'
           THEN data_health_issues.reopen_count + 1
         ELSE data_health_issues.reopen_count
       END,
       updated_at = EXCLUDED.updated_at
     RETURNING
       id,
       hotel_id,
       issue_code,
       title,
       severity,
       status,
       message,
       metadata,
       first_detected_at,
       last_detected_at,
       resolved_at,
       reopen_count,
       updated_at`,
    [
      hotelId,
      issueCode,
      title,
      severity,
      message,
      JSON.stringify(metadata || {}),
      detectedAt,
    ],
  );

  return rows[0] || null;
}

export async function resolveInactiveDataHealthIssues(hotelId, activeIssueCodes = []) {
  const activeCodes = Array.isArray(activeIssueCodes)
    ? activeIssueCodes.filter((code) => typeof code === 'string' && code.trim())
    : [];

  if (!activeCodes.length) {
    const { rows } = await pool.query(
      `UPDATE data_health_issues
       SET status = 'resolved',
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE hotel_id = $1
         AND status = 'open'
       RETURNING id, issue_code, status, updated_at`,
      [hotelId],
    );
    return rows;
  }

  const { rows } = await pool.query(
    `UPDATE data_health_issues
     SET status = 'resolved',
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE hotel_id = $1
       AND status = 'open'
       AND issue_code <> ALL($2::text[])
     RETURNING id, issue_code, status, updated_at`,
    [hotelId, activeCodes],
  );
  return rows;
}

export async function listDataHealthIssues(hotelId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT
       id,
       hotel_id,
       issue_code,
       title,
       severity,
       status,
       message,
       metadata,
       first_detected_at,
       last_detected_at,
       resolved_at,
       reopen_count,
       updated_at
     FROM data_health_issues
     WHERE hotel_id = $1
     ORDER BY
       CASE WHEN status = 'open' THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT $2`,
    [hotelId, limit],
  );
  return rows;
}
