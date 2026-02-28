import { pool } from '../db/pool.js';

export async function getCompetitorRatesForHotel(hotelId) {
  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT
         cr.competitor_id,
         c.competitor_name,
         COALESCE(c.url, c.website_url) AS website_url,
         cr.price_today::float8 AS price_today,
         cr.price_48h_ago::float8 AS price_48h_ago,
         cr.scraped_at,
         ROW_NUMBER() OVER (PARTITION BY cr.competitor_id ORDER BY cr.scraped_at DESC) AS rn
       FROM competitor_rates cr
       JOIN competitors c ON c.id = cr.competitor_id
       WHERE cr.hotel_id = $1
     )
     SELECT
       competitor_id AS id,
       competitor_name,
       website_url,
       MAX(CASE WHEN rn = 1 THEN price_today END) AS price_today,
       COALESCE(
         MAX(CASE WHEN rn = 1 THEN price_48h_ago END),
         MAX(CASE WHEN rn = 2 THEN price_today END)
       ) AS price_48h_ago,
       COALESCE(
         MAX(CASE WHEN rn = 2 THEN price_48h_ago END),
         MAX(CASE WHEN rn = 3 THEN price_today END),
         MAX(CASE WHEN rn = 1 THEN price_48h_ago END)
       ) AS price_7d_ago,
       MAX(CASE WHEN rn = 1 THEN scraped_at END) AS scraped_at
     FROM ranked
     GROUP BY competitor_id, competitor_name, website_url
     ORDER BY competitor_name ASC`,
    [hotelId],
  );

  return rows;
}

export async function getLatestHotelPrice(hotelId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(
       (
         SELECT hrs.price::float8
         FROM hotel_rate_snapshots hrs
         WHERE hrs.hotel_id = $1
         ORDER BY hrs.captured_at DESC
         LIMIT 1
       ),
       (
         SELECT ROUND((h.base_price_min + h.base_price_max) / 2.0)::float8
         FROM hotels h
         WHERE h.id = $1
       ),
       0
     ) AS hotel_price`,
    [hotelId],
  );

  return rows[0]?.hotel_price ?? null;
}

export async function getAirfareSeries(city) {
  const { rows } = await pool.query(
    `SELECT date, avg_price::float8 AS avg_price
     FROM airfare_data
     WHERE city = $1
       AND date >= CURRENT_DATE - INTERVAL '21 days'
     ORDER BY date DESC`,
    [city],
  );
  return rows;
}

export async function getUpcomingHolidays(city) {
  const { rows } = await pool.query(
    `SELECT holiday_date, holiday_name, holiday_type
     FROM holidays
     WHERE city = $1
       AND holiday_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
     ORDER BY holiday_date ASC`,
    [city],
  );

  return rows;
}

export async function getCityWeights(city) {
  const { rows } = await pool.query(
    `SELECT competitor_weight::float8, holiday_weight::float8, airfare_weight::float8, season_weight::float8
     FROM city_weights
     WHERE city = $1`,
    [city],
  );

  return rows[0] || null;
}

export async function getLatestCompetitorScrapeAt(hotelId) {
  const { rows } = await pool.query(
    `SELECT MAX(scraped_at) AS last_scraped_at
     FROM competitor_rates
     WHERE hotel_id = $1`,
    [hotelId],
  );

  return rows[0]?.last_scraped_at || null;
}
