-- Uttarakhand operating cities rollout:
-- Nainital, Corbett, Mukeshwar (+ Mukteshwar alias support)

INSERT INTO states (name, country, timezone)
VALUES ('Uttarakhand', 'India', 'Asia/Kolkata')
ON CONFLICT (name, country) DO UPDATE
SET timezone = EXCLUDED.timezone;

INSERT INTO holiday_calendars (name)
VALUES ('Uttarakhand Hill Calendar')
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
  'Hill Leisure',
  'Seasonal hill demand with summer and holiday spikes.',
  '{"jan":58,"feb":60,"mar":63,"apr":69,"may":78,"jun":82,"jul":66,"aug":61,"sep":64,"oct":68,"nov":62,"dec":71}'::jsonb,
  1.10,
  1.04,
  1.07,
  1.05,
  1.00
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
  JOIN season_profiles sp ON sp.name = 'Hill Leisure'
  JOIN holiday_calendars hc ON hc.name = 'Uttarakhand Hill Calendar'
  WHERE s.name = 'Uttarakhand' AND s.country = 'India'
  LIMIT 1
)
INSERT INTO cities (name, state_id, airport_code, season_profile_id, holiday_calendar_id)
SELECT x.name, refs.state_id, x.airport_code, refs.season_profile_id, refs.holiday_calendar_id
FROM refs
JOIN (
  VALUES
    ('Nainital', 'PGH'),
    ('Corbett', 'PGH'),
    ('Mukeshwar', 'PGH'),
    ('Mukteshwar', 'PGH')
) AS x(name, airport_code) ON TRUE
ON CONFLICT (name) DO UPDATE
SET
  state_id = EXCLUDED.state_id,
  airport_code = EXCLUDED.airport_code,
  season_profile_id = EXCLUDED.season_profile_id,
  holiday_calendar_id = EXCLUDED.holiday_calendar_id;

INSERT INTO city_weights (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES
  ('Nainital', 0.39, 0.24, 0.12, 0.25),
  ('Corbett', 0.40, 0.25, 0.12, 0.23),
  ('Mukeshwar', 0.38, 0.24, 0.13, 0.25),
  ('Mukteshwar', 0.38, 0.24, 0.13, 0.25)
ON CONFLICT (city) DO UPDATE
SET
  competitor_weight = EXCLUDED.competitor_weight,
  holiday_weight = EXCLUDED.holiday_weight,
  airfare_weight = EXCLUDED.airfare_weight,
  season_weight = EXCLUDED.season_weight,
  updated_at = NOW();

INSERT INTO airfare_data (city, date, avg_price)
SELECT city_name, CURRENT_DATE - g, base_fare + (g * step)
FROM (
  VALUES
    ('Nainital', 5400, 9),
    ('Corbett', 5700, 10),
    ('Mukeshwar', 5600, 9),
    ('Mukteshwar', 5600, 9)
) AS t(city_name, base_fare, step)
CROSS JOIN generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE
SET avg_price = EXCLUDED.avg_price;

INSERT INTO holidays (city, holiday_date, holiday_name, holiday_type)
VALUES
  ('Nainital', CURRENT_DATE + 4, 'Nainital Weekend Surge', 'long_weekend'),
  ('Nainital', CURRENT_DATE + 11, 'Kumaon Regional Holiday', 'regional'),
  ('Corbett', CURRENT_DATE + 3, 'Corbett Safari Weekend', 'long_weekend'),
  ('Corbett', CURRENT_DATE + 12, 'Uttarakhand Public Holiday', 'public'),
  ('Mukeshwar', CURRENT_DATE + 5, 'Hill Escape Long Weekend', 'long_weekend'),
  ('Mukeshwar', CURRENT_DATE + 13, 'Mukeshwar Regional Day', 'regional'),
  ('Mukteshwar', CURRENT_DATE + 5, 'Hill Escape Long Weekend', 'long_weekend'),
  ('Mukteshwar', CURRENT_DATE + 13, 'Mukteshwar Regional Day', 'regional')
ON CONFLICT DO NOTHING;

UPDATE hotels h
SET city_id = c.id
FROM cities c
WHERE LOWER(h.city) = LOWER(c.name)
  AND h.city_id IS DISTINCT FROM c.id;
