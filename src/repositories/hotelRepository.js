import { pool } from '../db/pool.js';
import { focusCityKeys } from '../config/productScope.js';

export async function listHotels() {
  const { rows } = await pool.query(
    `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE LOWER(COALESCE(c.name, h.city)) = ANY($1::text[])
     ORDER BY hotel_name ASC`,
    [focusCityKeys],
  );
  return rows;
}

export async function listHotelsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
     FROM hotel_users hu
     JOIN hotels h ON h.id = hu.hotel_id
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE hu.user_id = $1
       AND LOWER(COALESCE(c.name, h.city)) = ANY($2::text[])
     ORDER BY h.hotel_name ASC`,
    [userId, focusCityKeys],
  );
  return rows;
}

export async function getHotelById(hotelId) {
  const { rows } = await pool.query(
    `SELECT
      h.id,
      h.tenant_id,
      h.hotel_name,
      COALESCE(c.name, h.city) AS city,
      h.city_id,
      h.alert_sensitivity,
      h.room_count,
      h.base_price_min,
      h.base_price_max,
      h.comp_set_json,
      h.subscription_status,
      h.last_calculated_at,
      sp.name AS season_profile_name,
      sp.monthly_weights_json,
      sp.weekend_multiplier,
      sp.volatility_multiplier,
     sp.event_sensitivity,
     sp.compression_sensitivity,
     sp.confidence_bias
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     LEFT JOIN season_profiles sp ON sp.id = c.season_profile_id
     WHERE h.id = $1
       AND LOWER(COALESCE(c.name, h.city)) = ANY($2::text[])`,
    [hotelId, focusCityKeys],
  );
  return rows[0] || null;
}

export async function touchHotelCalculatedAt(hotelId) {
  await pool.query(
    `UPDATE hotels
     SET last_calculated_at = NOW()
     WHERE id = $1`,
    [hotelId],
  );
}
