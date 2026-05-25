import { pool } from '../db/pool.js';
import { focusCityKeys } from '../config/productScope.js';

export async function listMarketDemandEvidence(city, options = {}) {
  const horizonDays = Number.isFinite(Number(options.horizonDays))
    ? Math.max(1, Math.min(60, Math.round(Number(options.horizonDays))))
    : 30;

  const { rows } = await pool.query(
    `WITH business_clock AS (
       SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS business_date
     ),
     date_spine AS (
       SELECT (bc.business_date + day_offset::int)::date AS stay_date
       FROM business_clock bc
       CROSS JOIN generate_series(0, GREATEST($2::int, 1) - 1) AS day_offset
     ),
     city_hotels AS (
       SELECT id
       FROM hotels
       WHERE lower(city) = lower($1)
         AND lower(city) = ANY($3::text[])
     ),
     competitor AS (
       SELECT
         cr.checkin_date::date AS stay_date,
         COUNT(*)::int AS competitor_rate_rows,
         COUNT(DISTINCT cr.competitor_id)::int AS competitor_count,
         AVG(
           COALESCE(
             NULLIF(to_jsonb(cr)->>'price_today', '')::numeric,
             NULLIF(to_jsonb(cr)->>'price', '')::numeric
           )
         )::float8 AS market_avg_price,
         AVG(NULLIF(to_jsonb(cr)->>'price_48h_ago', '')::numeric)::float8 AS market_avg_price_48h_ago,
         MAX(cr.scraped_at) AS competitor_last_scraped_at
       FROM competitor_rates cr
       JOIN city_hotels h ON h.id = cr.hotel_id
       CROSS JOIN business_clock bc
       WHERE cr.checkin_date >= bc.business_date
         AND cr.checkin_date < bc.business_date + make_interval(days => $2::int)
       GROUP BY cr.checkin_date
     ),
     hotel_rates AS (
       SELECT
         hrs.checkin_date::date AS stay_date,
         COUNT(*)::int AS hotel_rate_rows,
         COUNT(DISTINCT hrs.hotel_id)::int AS hotel_count,
         AVG(hrs.price)::float8 AS hotel_avg_price,
         MAX(hrs.captured_at) AS hotel_rate_last_captured_at
       FROM hotel_rate_snapshots hrs
       JOIN city_hotels h ON h.id = hrs.hotel_id
       CROSS JOIN business_clock bc
       WHERE hrs.checkin_date >= bc.business_date
         AND hrs.checkin_date < bc.business_date + make_interval(days => $2::int)
       GROUP BY hrs.checkin_date
     ),
     event_rows AS (
       SELECT
         ds.stay_date,
         COALESCE(SUM(ce.impact_score), 0)::float8 AS event_impact_score,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'event_name', ce.event_name,
               'start_date', to_char(ce.start_date, 'YYYY-MM-DD'),
               'end_date', to_char(ce.end_date, 'YYYY-MM-DD'),
               'category', ce.category,
               'scale', ce.scale,
               'confidence', ce.confidence,
               'impact_score', ce.impact_score,
               'scraped_at', ce.scraped_at
             )
             ORDER BY ce.impact_score DESC, ce.start_date ASC
           ) FILTER (WHERE ce.id IS NOT NULL),
           '[]'::jsonb
         ) AS events
       FROM date_spine ds
       CROSS JOIN business_clock bc
       LEFT JOIN city_events ce
         ON lower(ce.city) = lower($1)
        AND lower(ce.city) = ANY($3::text[])
        AND ce.start_date <= ds.stay_date
        AND ce.end_date >= ds.stay_date
        AND ce.end_date >= bc.business_date
       GROUP BY ds.stay_date
     ),
     holiday_rows AS (
       SELECT
         h.holiday_date::date AS stay_date,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'holiday_name', h.holiday_name,
               'holiday_type', h.holiday_type
             )
             ORDER BY h.holiday_name ASC
           ),
           '[]'::jsonb
         ) AS holidays
       FROM holidays h
       CROSS JOIN business_clock bc
       WHERE lower(h.city) = lower($1)
         AND lower(h.city) = ANY($3::text[])
         AND h.holiday_date >= bc.business_date
         AND h.holiday_date < bc.business_date + make_interval(days => $2::int)
       GROUP BY h.holiday_date
     ),
     latest_airfare AS (
       SELECT
         a.date AS airfare_observed_date,
         a.avg_price::float8 AS airfare_avg_price,
         COALESCE(
           NULLIF(to_jsonb(a)->>'price_change_percent', '')::numeric,
           NULLIF(to_jsonb(a)->>'change_pct', '')::numeric,
           0
         )::float8 AS airfare_change_pct
       FROM airfare_data a
       CROSS JOIN business_clock bc
       WHERE lower(a.city) = lower($1)
         AND lower(a.city) = ANY($3::text[])
         AND a.date >= bc.business_date - INTERVAL '21 days'
       ORDER BY a.date DESC
       LIMIT 1
     )
     SELECT
       to_char(ds.stay_date, 'YYYY-MM-DD') AS stay_date,
       EXTRACT(ISODOW FROM ds.stay_date)::int AS iso_dow,
       COALESCE(c.competitor_rate_rows, 0)::int AS competitor_rate_rows,
       COALESCE(c.competitor_count, 0)::int AS competitor_count,
       c.market_avg_price,
       c.market_avg_price_48h_ago,
       c.competitor_last_scraped_at,
       COALESCE(hr.hotel_rate_rows, 0)::int AS hotel_rate_rows,
       COALESCE(hr.hotel_count, 0)::int AS hotel_count,
       hr.hotel_avg_price,
       hr.hotel_rate_last_captured_at,
       COALESCE(er.event_impact_score, 0)::float8 AS event_impact_score,
       COALESCE(er.events, '[]'::jsonb) AS events,
       COALESCE(hol.holidays, '[]'::jsonb) AS holidays,
       la.airfare_observed_date,
       la.airfare_avg_price,
       la.airfare_change_pct,
       NOW() AS computed_at
     FROM date_spine ds
     LEFT JOIN competitor c ON c.stay_date = ds.stay_date
     LEFT JOIN hotel_rates hr ON hr.stay_date = ds.stay_date
     LEFT JOIN event_rows er ON er.stay_date = ds.stay_date
     LEFT JOIN holiday_rows hol ON hol.stay_date = ds.stay_date
     LEFT JOIN latest_airfare la ON TRUE
     ORDER BY ds.stay_date ASC`,
    [city, horizonDays, focusCityKeys],
  );

  return rows;
}

export async function upsertMarketDemandSnapshot(snapshot) {
  const { rows } = await pool.query(
    `INSERT INTO market_demand_snapshots (
       city,
       stay_date,
       demand_score,
       confidence_score,
       demand_level,
       pricing_action,
       price_adjustment_pct,
       trust_status,
       top_drivers_json,
       freshness_json,
       computed_at
     ) VALUES (
       $1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, COALESCE($11::timestamptz, NOW())
     )
     ON CONFLICT (city, stay_date)
     DO UPDATE SET
       demand_score = EXCLUDED.demand_score,
       confidence_score = EXCLUDED.confidence_score,
       demand_level = EXCLUDED.demand_level,
       pricing_action = EXCLUDED.pricing_action,
       price_adjustment_pct = EXCLUDED.price_adjustment_pct,
       trust_status = EXCLUDED.trust_status,
       top_drivers_json = EXCLUDED.top_drivers_json,
       freshness_json = EXCLUDED.freshness_json,
       computed_at = EXCLUDED.computed_at
     RETURNING *`,
    [
      snapshot.city,
      snapshot.stay_date,
      snapshot.demand_score,
      snapshot.confidence_score,
      snapshot.demand_level,
      snapshot.pricing_action,
      snapshot.price_adjustment_pct,
      snapshot.trust_status,
      JSON.stringify(snapshot.top_drivers || []),
      JSON.stringify(snapshot.freshness || {}),
      snapshot.computed_at || null,
    ],
  );

  return rows[0] || null;
}
