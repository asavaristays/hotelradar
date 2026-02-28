WITH t AS (
  INSERT INTO tenants (tenant_name)
  VALUES ('Demo Hospitality Group')
  RETURNING id
), h AS (
  INSERT INTO hotels (tenant_id, hotel_name, city, alert_sensitivity)
  SELECT id, 'Seabreeze Goa', 'Goa', 'balanced' FROM t
  RETURNING id, city
), c1 AS (
  INSERT INTO competitors (hotel_id, competitor_name, website_url)
  SELECT id, 'Goa Sands Resort', 'https://example.com/goa-sands' FROM h
  RETURNING id, hotel_id
), c2 AS (
  INSERT INTO competitors (hotel_id, competitor_name, website_url)
  SELECT id, 'Palmview Goa', 'https://example.com/palmview' FROM h
  RETURNING id, hotel_id
)
INSERT INTO competitor_rates (hotel_id, competitor_id, checkin_date, price, scraped_at)
SELECT c1.hotel_id, c1.id, CURRENT_DATE + 7, 8500, NOW() - INTERVAL '60 hours' FROM c1
UNION ALL
SELECT c1.hotel_id, c1.id, CURRENT_DATE + 7, 9400, NOW() - INTERVAL '4 hours' FROM c1
UNION ALL
SELECT c2.hotel_id, c2.id, CURRENT_DATE + 7, 8000, NOW() - INTERVAL '58 hours' FROM c2
UNION ALL
SELECT c2.hotel_id, c2.id, CURRENT_DATE + 7, 9100, NOW() - INTERVAL '3 hours' FROM c2;

INSERT INTO hotel_rate_snapshots (hotel_id, checkin_date, price, captured_at)
SELECT id, CURRENT_DATE + 7, 8300, NOW() - INTERVAL '3 hours' FROM hotels WHERE hotel_name = 'Seabreeze Goa';

INSERT INTO airfare_data (city, date, avg_price, price_change_percent)
SELECT 'Goa', CURRENT_DATE - g, 6200 + (g * 18), 0
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE
SET avg_price = EXCLUDED.avg_price;

INSERT INTO holidays (city, holiday_date, holiday_name, holiday_type)
VALUES
  ('Goa', CURRENT_DATE + 2, 'Regional Festival', 'major')
ON CONFLICT DO NOTHING;

INSERT INTO city_events (city, event_name, start_date, end_date, impact_score)
VALUES
  ('Mumbai', 'Trade Expo', CURRENT_DATE + 5, CURRENT_DATE + 7, 14)
ON CONFLICT DO NOTHING;
