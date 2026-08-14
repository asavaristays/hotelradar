import { pool } from '../db/pool.js';
import { focusCityKeys } from '../config/productScope.js';

export async function getCompetitorRatesForHotel(hotelId, options = {}) {
  const checkinDate = options?.checkinDate || null;
  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT
         cr.competitor_id,
         cr.checkin_date,
         c.competitor_name,
         COALESCE(c.url, c.website_url) AS website_url,
         cr.price_today::float8 AS price_today,
         cr.price_48h_ago::float8 AS price_48h_ago,
         cr.scraped_at,
         ROW_NUMBER() OVER (PARTITION BY cr.competitor_id ORDER BY cr.scraped_at DESC) AS rn
       FROM competitor_rates cr
       JOIN competitors c ON c.id = cr.competitor_id
       WHERE cr.hotel_id = $1
         AND ($2::date IS NULL OR cr.checkin_date = $2::date)
     )
     SELECT
       competitor_id AS id,
       competitor_name,
       website_url,
       MAX(CASE WHEN rn = 1 THEN checkin_date END) AS checkin_date,
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
    [hotelId, checkinDate],
  );

  return rows;
}

export async function getLatestHotelPrice(hotelId, options = {}) {
  const checkinDate = options?.checkinDate || null;
  const { rows } = await pool.query(
    `SELECT COALESCE(
       (
         SELECT hrs.price::float8
         FROM hotel_rate_snapshots hrs
         WHERE hrs.hotel_id = $1
           AND ($2::date IS NULL OR hrs.checkin_date = $2::date)
         ORDER BY hrs.captured_at DESC
         LIMIT 1
       ),
       0
     ) AS hotel_price`,
    [hotelId, checkinDate],
  );

  return rows[0]?.hotel_price ?? null;
}

export async function getLatestMarketCheckinDate(hotelId) {
  const { rows } = await pool.query(
    `WITH hotel_dates AS (
       SELECT
         hrs.checkin_date,
         MAX(hrs.captured_at) AS observed_at,
         COUNT(*) AS hotel_rows
       FROM hotel_rate_snapshots hrs
       WHERE hrs.hotel_id = $1
       GROUP BY hrs.checkin_date
     ),
     competitor_dates AS (
       SELECT
         cr.checkin_date,
         MAX(cr.scraped_at) AS observed_at,
         COUNT(DISTINCT cr.competitor_id) AS competitor_rows
       FROM competitor_rates cr
       JOIN competitors c ON c.id = cr.competitor_id
       WHERE cr.hotel_id = $1
         AND NOT (
           COALESCE(c.competitor_name, '') ~* '(booking|agoda|makemytrip|\\ymmt\\y|goibibo|expedia|trip\\.?com|tripadvisor)'
           OR COALESCE(COALESCE(c.url, c.website_url), '') ~* '(booking|agoda|makemytrip|goibibo|expedia|trip\\.?com|tripadvisor)'
         )
       GROUP BY cr.checkin_date
     ),
     ranked AS (
       SELECT
         COALESCE(hd.checkin_date, cd.checkin_date) AS checkin_date,
         COALESCE(GREATEST(hd.observed_at, cd.observed_at), hd.observed_at, cd.observed_at) AS observed_at,
         COALESCE(hd.hotel_rows, 0) AS hotel_rows,
         COALESCE(cd.competitor_rows, 0) AS competitor_rows
       FROM hotel_dates hd
       FULL OUTER JOIN competitor_dates cd ON cd.checkin_date = hd.checkin_date
     )
     SELECT
       checkin_date,
       observed_at,
       hotel_rows,
       competitor_rows
     FROM ranked
     ORDER BY
       CASE WHEN hotel_rows > 0 AND competitor_rows > 0 THEN 1 ELSE 0 END DESC,
       competitor_rows DESC,
       hotel_rows DESC,
       observed_at DESC
     LIMIT 1`,
    [hotelId],
  );

  return rows[0] || null;
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

export async function getLatestCompetitorScrapeAt(hotelId, options = {}) {
  const checkinDate = options?.checkinDate || null;
  const { rows } = await pool.query(
    `SELECT MAX(scraped_at) AS last_scraped_at
     FROM competitor_rates
     WHERE hotel_id = $1
       AND ($2::date IS NULL OR checkin_date = $2::date)`,
    [hotelId, checkinDate],
  );

  return rows[0]?.last_scraped_at || null;
}

export async function getUpcomingEvents(city, options = {}) {
  const horizonDays = Number.isFinite(Number(options?.horizonDays))
    ? Number(options.horizonDays)
    : 30;
  const { rows } = await pool.query(
    `SELECT
       id,
       city,
       event_name,
       venue,
       start_date,
       end_date,
       category,
       scale,
       estimated_attendance,
       radius_impact_km,
       source,
       confidence,
       venue_lat,
       venue_lng,
       event_url,
       impact_score,
       scraped_at
     FROM city_events
     WHERE lower(city) = lower($1)
       AND lower(city) = ANY($2::text[])
       AND end_date >= CURRENT_DATE
       AND start_date <= CURRENT_DATE + make_interval(days => $3)
     ORDER BY start_date ASC, event_name ASC`,
    [city, focusCityKeys, horizonDays],
  );

  return rows;
}
