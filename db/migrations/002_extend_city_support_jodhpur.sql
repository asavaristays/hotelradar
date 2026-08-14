ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_city_check;
ALTER TABLE hotels
  ADD CONSTRAINT hotels_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Jodhpur', 'Pushkar', 'Jawai'));

ALTER TABLE airfare_data DROP CONSTRAINT IF EXISTS airfare_data_city_check;
ALTER TABLE airfare_data
  ADD CONSTRAINT airfare_data_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Jodhpur', 'Pushkar', 'Jawai'));

ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_city_check;
ALTER TABLE holidays
  ADD CONSTRAINT holidays_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Jodhpur', 'Pushkar', 'Jawai'));

ALTER TABLE city_weights DROP CONSTRAINT IF EXISTS city_weights_city_check;
ALTER TABLE city_weights
  ADD CONSTRAINT city_weights_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Jodhpur', 'Pushkar', 'Jawai'));

INSERT INTO city_weights (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES
  ('Jodhpur', 0.42, 0.28, 0.15, 0.15),
  ('Pushkar', 0.41, 0.27, 0.14, 0.18),
  ('Jawai', 0.43, 0.22, 0.10, 0.25)
ON CONFLICT (city) DO UPDATE
SET competitor_weight = EXCLUDED.competitor_weight,
    holiday_weight = EXCLUDED.holiday_weight,
    airfare_weight = EXCLUDED.airfare_weight,
    season_weight = EXCLUDED.season_weight,
    updated_at = NOW();
