-- Jaipur controlled operating-market rollout

INSERT INTO states (name, country, timezone)
VALUES ('Rajasthan', 'India', 'Asia/Kolkata')
ON CONFLICT (name, country) DO UPDATE
SET timezone = EXCLUDED.timezone;

INSERT INTO holiday_calendars (name)
VALUES ('Rajasthan Heritage Calendar')
ON CONFLICT (name) DO NOTHING;

INSERT INTO season_profiles (
  name,
  description,
  monthly_weights_json,
  weekend_multiplier,
  volatility_multiplier,
  event_sensitivity,
  compression_sensitivity,
  confidence_bias
)
VALUES (
  'Heritage Desert',
  'Winter-heavy heritage and experiential demand.',
  '{"jan":64,"feb":67,"mar":70,"apr":62,"may":54,"jun":44,"jul":39,"aug":42,"sep":53,"oct":70,"nov":88,"dec":84}'::jsonb,
  1.09,
  1.02,
  1.10,
  1.12,
  1.50
)
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  monthly_weights_json = EXCLUDED.monthly_weights_json,
  weekend_multiplier = EXCLUDED.weekend_multiplier,
  volatility_multiplier = EXCLUDED.volatility_multiplier,
  event_sensitivity = EXCLUDED.event_sensitivity,
  compression_sensitivity = EXCLUDED.compression_sensitivity,
  confidence_bias = EXCLUDED.confidence_bias;

WITH refs AS (
  SELECT
    s.id AS state_id,
    sp.id AS season_profile_id,
    hc.id AS holiday_calendar_id
  FROM states s
  JOIN season_profiles sp ON sp.name = 'Heritage Desert'
  JOIN holiday_calendars hc ON hc.name = 'Rajasthan Heritage Calendar'
  WHERE s.name = 'Rajasthan' AND s.country = 'India'
  LIMIT 1
)
INSERT INTO cities (name, state_id, airport_code, season_profile_id, holiday_calendar_id)
SELECT 'Jaipur', refs.state_id, 'JAI', refs.season_profile_id, refs.holiday_calendar_id
FROM refs
ON CONFLICT (name) DO UPDATE
SET
  state_id = EXCLUDED.state_id,
  airport_code = EXCLUDED.airport_code,
  season_profile_id = EXCLUDED.season_profile_id,
  holiday_calendar_id = EXCLUDED.holiday_calendar_id;

INSERT INTO city_weights (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES ('Jaipur', 0.42, 0.26, 0.14, 0.18)
ON CONFLICT (city) DO UPDATE
SET
  competitor_weight = EXCLUDED.competitor_weight,
  holiday_weight = EXCLUDED.holiday_weight,
  airfare_weight = EXCLUDED.airfare_weight,
  season_weight = EXCLUDED.season_weight,
  updated_at = NOW();

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Jaipur', CURRENT_DATE - g, 5100 + (g * 8)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE
SET avg_price = EXCLUDED.avg_price;

INSERT INTO holidays (city, holiday_date, holiday_name, holiday_type)
VALUES
  ('Jaipur', CURRENT_DATE + 4, 'Jaipur Heritage Weekend', 'long_weekend'),
  ('Jaipur', CURRENT_DATE + 11, 'Rajasthan Regional Holiday', 'regional')
ON CONFLICT DO NOTHING;

UPDATE hotels h
SET city_id = c.id
FROM cities c
WHERE LOWER(h.city) = 'jaipur'
  AND LOWER(c.name) = 'jaipur'
  AND h.city_id IS DISTINCT FROM c.id;
