import { pool } from '../db/pool.js';

async function deactivateStaleSurgeWindowAlerts(hotelId, staleDays = 7) {
  await pool.query(
    `UPDATE alerts
     SET active = FALSE
     WHERE hotel_id = $1
       AND active = TRUE
       AND alert_type = 'surge_window'
       AND created_at < NOW() - make_interval(days => $2::int)`,
    [hotelId, staleDays],
  );
}

export async function listActiveAlerts(hotelId, limit = 20) {
  await deactivateStaleSurgeWindowAlerts(hotelId, 7);

  const { rows } = await pool.query(
    `SELECT id, alert_type, severity, message, metadata, created_at
     FROM alerts
     WHERE hotel_id = $1
       AND active = TRUE
     ORDER BY created_at DESC
     LIMIT $2`,
    [hotelId, limit],
  );

  return rows;
}

export async function getDailyAlertCount(hotelId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM alerts
     WHERE hotel_id = $1
       AND created_at::date = CURRENT_DATE`,
    [hotelId],
  );

  return rows[0]?.count || 0;
}

export async function insertAlerts(alerts) {
  if (!alerts.length) return [];

  const values = [];
  const placeholders = alerts.map((alert, index) => {
    const offset = index * 5;
    values.push(
      alert.hotelId,
      alert.alertType,
      alert.severity,
      alert.message,
      JSON.stringify(alert.metadata || {}),
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::jsonb)`;
  });

  const { rows } = await pool.query(
    `INSERT INTO alerts (hotel_id, alert_type, severity, message, metadata)
     VALUES ${placeholders.join(', ')}
     RETURNING id, alert_type, severity, message, metadata, created_at`,
    values,
  );

  return rows;
}
