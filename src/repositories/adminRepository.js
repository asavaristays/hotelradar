import { pool } from '../db/pool.js';

export async function listStates() {
  const { rows } = await pool.query(
    `SELECT id, name, country, timezone, created_at
     FROM states
     ORDER BY name ASC`,
  );
  return rows;
}

export async function listSeasonProfiles() {
  const { rows } = await pool.query(
    `SELECT id, name, description, created_at
     FROM season_profiles
     ORDER BY name ASC`,
  );
  return rows;
}

export async function listHolidayCalendars() {
  const { rows } = await pool.query(
    `SELECT id, name, created_at
     FROM holiday_calendars
     ORDER BY name ASC`,
  );
  return rows;
}

export async function listCities(filters = {}) {
  const values = [];
  const where = [];
  if (filters.stateId) {
    values.push(filters.stateId);
    where.push(`c.state_id = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.name,
       c.state_id,
       s.name AS state_name,
       c.airport_code,
       c.season_profile_id,
       c.holiday_calendar_id,
       c.created_at
     FROM cities c
     JOIN states s ON s.id = c.state_id
     ${whereClause}
     ORDER BY s.name ASC, c.name ASC`,
    values,
  );
  return rows;
}

export async function listHotelProfiles(filters = {}) {
  const values = [];
  const where = [];

  if (filters.stateId) {
    values.push(filters.stateId);
    where.push(`c.state_id = $${values.length}`);
  }

  if (filters.cityId) {
    values.push(filters.cityId);
    where.push(`h.city_id = $${values.length}`);
  }

  if (filters.subscriptionStatus) {
    values.push(filters.subscriptionStatus);
    where.push(`h.subscription_status = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(
      `(h.hotel_name ILIKE $${values.length} OR COALESCE(u.email, '') ILIKE $${values.length} OR COALESCE(u.full_name, '') ILIKE $${values.length})`,
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       h.id,
       h.hotel_name,
       h.city_id,
       COALESCE(c.name, h.city) AS city,
       c.state_id,
       s.name AS state_name,
       h.room_count,
       h.base_price_min,
       h.base_price_max,
       h.alert_sensitivity,
       h.subscription_status,
       h.last_calculated_at,
       h.created_at,
       u.user_id,
       u.email AS user_email,
       u.full_name AS user_full_name,
       u.mobile_no AS user_mobile_no,
       u.active AS user_active
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN states s ON s.id = c.state_id
     LEFT JOIN LATERAL (
       SELECT u.id AS user_id, u.email, u.full_name, u.mobile_no, u.active
       FROM hotel_users hu
       JOIN users u ON u.id = hu.user_id
       WHERE hu.hotel_id = h.id
       ORDER BY hu.created_at ASC
       LIMIT 1
     ) u ON TRUE
     ${whereClause}
     ORDER BY h.hotel_name ASC`,
    values,
  );
  return rows;
}

export async function createState(payload) {
  const { name, country = 'India', timezone = 'Asia/Kolkata' } = payload;
  const { rows } = await pool.query(
    `INSERT INTO states (name, country, timezone)
     VALUES ($1,$2,$3)
     ON CONFLICT (name, country) DO UPDATE
     SET timezone = EXCLUDED.timezone
     RETURNING *`,
    [name, country, timezone],
  );
  return rows[0];
}

export async function createSeasonProfile(payload) {
  const {
    name,
    description = '',
    monthly_weights_json = {},
    weekend_multiplier = 1,
    volatility_multiplier = 1,
    event_sensitivity = 1,
    compression_sensitivity = 1,
    confidence_bias = 0,
  } = payload;
  const { rows } = await pool.query(
    `INSERT INTO season_profiles (
      name, description, monthly_weights_json, weekend_multiplier,
      volatility_multiplier, event_sensitivity, compression_sensitivity, confidence_bias
    ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8)
    ON CONFLICT (name) DO UPDATE
    SET description = EXCLUDED.description,
        monthly_weights_json = EXCLUDED.monthly_weights_json,
        weekend_multiplier = EXCLUDED.weekend_multiplier,
        volatility_multiplier = EXCLUDED.volatility_multiplier,
        event_sensitivity = EXCLUDED.event_sensitivity,
        compression_sensitivity = EXCLUDED.compression_sensitivity,
        confidence_bias = EXCLUDED.confidence_bias
    RETURNING *`,
    [
      name,
      description,
      JSON.stringify(monthly_weights_json),
      weekend_multiplier,
      volatility_multiplier,
      event_sensitivity,
      compression_sensitivity,
      confidence_bias,
    ],
  );
  return rows[0];
}

export async function createCity(payload) {
  const { name, state_id, airport_code, season_profile_id, holiday_calendar_id = null } = payload;
  const { rows } = await pool.query(
    `INSERT INTO cities (name, state_id, airport_code, season_profile_id, holiday_calendar_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (name) DO UPDATE
     SET state_id = EXCLUDED.state_id,
         airport_code = EXCLUDED.airport_code,
         season_profile_id = EXCLUDED.season_profile_id,
         holiday_calendar_id = EXCLUDED.holiday_calendar_id
     RETURNING *`,
    [name, state_id, airport_code, season_profile_id, holiday_calendar_id],
  );
  return rows[0];
}

export async function createHotel(payload) {
  const {
    id,
    tenant_id,
    hotel_name,
    city_id,
    room_count = 40,
    base_price_min = 1000,
    base_price_max = 50000,
    comp_set_json = [],
    subscription_status = 'active',
    alert_sensitivity = 'balanced',
  } = payload;

  const { rows } = await pool.query(
    `WITH seed_tenant AS (
       INSERT INTO tenants (id, tenant_name)
       SELECT gen_random_uuid(), 'Default Tenant'
       WHERE NOT EXISTS (SELECT 1 FROM tenants)
       RETURNING id
     ),
     selected_tenant AS (
       SELECT COALESCE(
         $2::uuid,
         (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1),
         (SELECT id FROM seed_tenant LIMIT 1)
       ) AS id
     ),
     created_hotel AS (
       INSERT INTO hotels (
      id,
      tenant_id,
      hotel_name,
      name,
      city,
      city_id,
      room_count,
      base_price_min,
      base_price_max,
      comp_set_json,
      subscription_status,
      alert_sensitivity
    )
    SELECT
      COALESCE($1::uuid, gen_random_uuid()),
      (SELECT id FROM selected_tenant),
      $3,
      $3,
      c.name,
      c.id,
      $4,
      $5,
      $6,
      $7::jsonb,
      $8,
      $9
    FROM cities c
    WHERE c.id = $10
    RETURNING id, hotel_name, city, city_id, subscription_status, base_price_min, base_price_max
     ),
     baseline_rate AS (
       INSERT INTO hotel_rate_snapshots (hotel_id, checkin_date, price, captured_at)
       SELECT
         ch.id,
         CURRENT_DATE + 7,
         GREATEST(1, ROUND((ch.base_price_min + ch.base_price_max) / 2.0)),
         NOW()
       FROM created_hotel ch
       RETURNING hotel_id
     )
     SELECT id, hotel_name, city, city_id, subscription_status
     FROM created_hotel`,
    [
      id,
      tenant_id,
      hotel_name,
      room_count,
      base_price_min,
      base_price_max,
      JSON.stringify(comp_set_json),
      subscription_status,
      alert_sensitivity,
      city_id,
    ],
  );
  return rows[0] || null;
}

export async function updateHotelProfile(hotelId, payload) {
  const {
    hotel_name,
    city_id,
    room_count,
    base_price_min,
    base_price_max,
    alert_sensitivity,
    subscription_status,
  } = payload;

  const { rows } = await pool.query(
    `WITH current_hotel AS (
       SELECT id, city_id
       FROM hotels
       WHERE id = $1
     ),
     resolved_city AS (
       SELECT c.id, c.name
       FROM cities c
       WHERE c.id = COALESCE($3::uuid, (SELECT city_id FROM current_hotel))
     )
     UPDATE hotels h
     SET
       hotel_name = COALESCE($2, h.hotel_name),
       name = COALESCE($2, h.name, h.hotel_name),
       city_id = COALESCE($3::uuid, h.city_id),
       city = COALESCE((SELECT name FROM resolved_city), h.city),
       room_count = COALESCE($4, h.room_count),
       base_price_min = COALESCE($5, h.base_price_min),
       base_price_max = COALESCE($6, h.base_price_max),
       alert_sensitivity = COALESCE($7, h.alert_sensitivity),
       subscription_status = COALESCE($8, h.subscription_status)
     WHERE h.id = $1
     RETURNING h.id, h.hotel_name, h.city_id, h.city, h.subscription_status`,
    [
      hotelId,
      hotel_name || null,
      city_id || null,
      Number.isFinite(Number(room_count)) ? Number(room_count) : null,
      Number.isFinite(Number(base_price_min)) ? Number(base_price_min) : null,
      Number.isFinite(Number(base_price_max)) ? Number(base_price_max) : null,
      alert_sensitivity || null,
      subscription_status || null,
    ],
  );

  return rows[0] || null;
}

export async function deleteHotelProfile(hotelId) {
  const { rows } = await pool.query(
    `DELETE FROM hotels
     WHERE id = $1
     RETURNING id, hotel_name`,
    [hotelId],
  );
  return rows[0] || null;
}

export async function upsertHotelUserForHotel(payload) {
  const {
    hotelId,
    email,
    passwordHash = null,
    fullName = '',
    mobileNo = '',
  } = payload;

  const { rows } = await pool.query(
    `WITH upserted_user AS (
       INSERT INTO users (email, password_hash, role, active, full_name, mobile_no)
       VALUES ($1, COALESCE($2, encode(digest('Hotel@123' || 'radar-v3-pepper', 'sha256'), 'hex')), 'hotel_user', TRUE, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET
         password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
         role = 'hotel_user',
         active = TRUE,
         full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), users.full_name),
         mobile_no = COALESCE(NULLIF(EXCLUDED.mobile_no, ''), users.mobile_no)
       RETURNING id, email, full_name, mobile_no, role, active
     ),
     mapped AS (
       INSERT INTO hotel_users (user_id, hotel_id)
       SELECT id, $5
       FROM upserted_user
       ON CONFLICT DO NOTHING
       RETURNING user_id
     )
     SELECT id, email, full_name, mobile_no, role, active
     FROM upserted_user`,
    [email, passwordHash, fullName, mobileNo, hotelId],
  );

  return rows[0] || null;
}

export async function listUsageAnalytics(filters = {}) {
  const values = [];
  const where = [];

  if (filters.hotelId) {
    values.push(filters.hotelId);
    where.push(`h.id = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       h.id AS hotel_id,
       h.hotel_name,
       COALESCE(c.name, h.city) AS city,
       COUNT(a.id) FILTER (WHERE a.created_at >= NOW() - INTERVAL '7 days')::int AS recalculations_7d,
       COUNT(a.id) FILTER (WHERE a.created_at >= NOW() - INTERVAL '30 days')::int AS recalculations_30d,
       COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at >= NOW() - INTERVAL '30 days')::int AS active_users_30d,
       MAX(a.created_at) AS last_activity_at
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN intelligence_audit_log a ON a.hotel_id = h.id
     ${whereClause}
     GROUP BY h.id, h.hotel_name, COALESCE(c.name, h.city)
     ORDER BY h.hotel_name ASC`,
    values,
  );
  return rows;
}

export async function listPasswordResetRequests(filters = {}) {
  const values = [];
  const where = [];

  if (filters.status) {
    values.push(filters.status);
    where.push(`pr.status = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       pr.id,
       pr.email,
       pr.user_id,
       pr.hotel_id,
       pr.status,
       pr.requested_by_ip,
       pr.requested_at,
       pr.resolved_at,
       pr.resolved_by,
       h.hotel_name,
       u.full_name
     FROM password_reset_requests pr
     LEFT JOIN hotels h ON h.id = pr.hotel_id
     LEFT JOIN users u ON u.id = pr.user_id
     ${whereClause}
     ORDER BY pr.requested_at DESC
     LIMIT 200`,
    values,
  );
  return rows;
}

export async function resolvePasswordResetRequest(payload) {
  const { requestId, resolvedByUserId, passwordHash } = payload;

  const { rows } = await pool.query(
    `WITH target AS (
       SELECT id, user_id
       FROM password_reset_requests
       WHERE id = $1
         AND status = 'pending'
       LIMIT 1
     ),
     user_update AS (
       UPDATE users u
       SET password_hash = $3
       FROM target t
       WHERE u.id = t.user_id
       RETURNING u.id
     )
     UPDATE password_reset_requests pr
     SET
       status = 'resolved',
       resolved_at = NOW(),
       resolved_by = $2
     WHERE pr.id = $1
       AND pr.status = 'pending'
     RETURNING pr.id, pr.email, pr.user_id, pr.hotel_id, pr.status, pr.requested_at, pr.resolved_at`,
    [requestId, resolvedByUserId, passwordHash],
  );

  return rows[0] || null;
}

export async function updateHotelSubscription(hotelId, subscriptionStatus) {
  const { rows } = await pool.query(
    `UPDATE hotels
     SET subscription_status = $2
     WHERE id = $1
     RETURNING id, hotel_name, subscription_status`,
    [hotelId, subscriptionStatus],
  );
  return rows[0] || null;
}
