import { pool } from '../db/pool.js';

export async function listActiveHotelsForIngestion() {
  const { rows } = await pool.query(
    `SELECT
       h.id,
       h.hotel_name,
       COALESCE(c.name, h.city) AS city,
       h.comp_set_json,
       h.subscription_status
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE COALESCE(h.subscription_status, 'active') = 'active'
     ORDER BY h.hotel_name ASC`,
  );
  return rows;
}

export async function getCompetitorByHotelAndName(hotelId, competitorName) {
  const { rows } = await pool.query(
    `SELECT id, competitor_name, website_url
     FROM competitors
     WHERE hotel_id = $1
       AND lower(competitor_name) = lower($2)
     ORDER BY created_at ASC
     LIMIT 1`,
    [hotelId, competitorName],
  );
  return rows[0] || null;
}

export async function insertCompetitor({ hotelId, competitorName, websiteUrl = null }) {
  const { rows } = await pool.query(
    `INSERT INTO competitors (id, hotel_id, competitor_name, website_url)
     VALUES (gen_random_uuid(), $1, $2, $3)
     RETURNING id, competitor_name, website_url`,
    [hotelId, competitorName, websiteUrl],
  );
  return rows[0] || null;
}

export async function getLatestCompetitorPrice({ hotelId, competitorId, checkinDate }) {
  const { rows } = await pool.query(
    `SELECT price_today::float8 AS price_today
     FROM competitor_rates
     WHERE hotel_id = $1
       AND competitor_id = $2
       AND checkin_date = $3::date
     ORDER BY scraped_at DESC
     LIMIT 1`,
    [hotelId, competitorId, checkinDate],
  );
  return Number(rows[0]?.price_today || 0) || null;
}

export async function insertCompetitorRateSnapshot({
  hotelId,
  competitorId,
  checkinDate,
  priceToday,
  price48hAgo,
  scrapedAt,
}) {
  const { rows } = await pool.query(
    `INSERT INTO competitor_rates (id, hotel_id, competitor_id, checkin_date, price_today, price_48h_ago, scraped_at)
     VALUES (gen_random_uuid(), $1, $2, $3::date, $4, $5, $6)
     RETURNING id, hotel_id, competitor_id, checkin_date, price_today, price_48h_ago, scraped_at`,
    [hotelId, competitorId, checkinDate, priceToday, price48hAgo, scrapedAt],
  );
  return rows[0] || null;
}

export async function insertHotelRateSnapshot({ hotelId, checkinDate, price, capturedAt }) {
  const { rows } = await pool.query(
    `INSERT INTO hotel_rate_snapshots (id, hotel_id, checkin_date, price, captured_at)
     VALUES (gen_random_uuid(), $1, $2::date, $3, $4)
     RETURNING id, hotel_id, checkin_date, price, captured_at`,
    [hotelId, checkinDate, price, capturedAt],
  );
  return rows[0] || null;
}

