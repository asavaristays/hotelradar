import { pool } from '../db/pool.js';

export async function getUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, active, full_name, mobile_no, beta_accepted_at
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

export async function getUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, role, active, full_name, mobile_no, beta_accepted_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export async function listUserHotelIds(userId) {
  const { rows } = await pool.query(
    `SELECT hotel_id
     FROM hotel_users
     WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => row.hotel_id);
}

export async function createPasswordResetRequest(payload) {
  const {
    email,
    userId = null,
    hotelId = null,
    requestedByIp = null,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO password_reset_requests (email, user_id, hotel_id, requested_by_ip)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, user_id, hotel_id, status, requested_at`,
    [email, userId, hotelId, requestedByIp],
  );

  return rows[0] || null;
}

export async function getFirstHotelIdForUser(userId) {
  const { rows } = await pool.query(
    `SELECT hotel_id
     FROM hotel_users
     WHERE user_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId],
  );
  return rows[0]?.hotel_id || null;
}

export async function acceptBetaTermsForUser(userId) {
  const { rows } = await pool.query(
    `UPDATE users
     SET beta_accepted_at = COALESCE(beta_accepted_at, NOW())
     WHERE id = $1
     RETURNING id, beta_accepted_at`,
    [userId],
  );
  return rows[0] || null;
}
