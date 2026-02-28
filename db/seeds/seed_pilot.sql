-- Tenants
INSERT INTO tenants (id, tenant_name)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Konkan Hospitality Group'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Metro Stay Collective')
ON CONFLICT (id) DO NOTHING;

-- Hotels (Goa + Mumbai + Rajasthan expansion)
INSERT INTO hotels (id, tenant_id, hotel_name, city, alert_sensitivity)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Hotel Taj Goa', 'Goa', 'balanced'),
  ('11111111-1111-4111-8111-111111111112', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Seabreeze Candolim', 'Goa', 'aggressive'),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'The Acacia Morjim Goa', 'Goa', 'balanced'),
  ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'The Oberoi Mumbai', 'Mumbai', 'balanced'),
  ('22222222-2222-4222-8222-222222222221', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Marine Drive Grand', 'Mumbai', 'balanced'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'BKC Business Hotel', 'Mumbai', 'conservative'),
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Rohet House Jodhpur', 'Jodhpur', 'balanced'),
  ('66666666-6666-4666-8666-666666666666', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Mayagarh Pushkar', 'Pushkar', 'balanced'),
  ('77777777-7777-4777-8777-777777777777', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Jwild Resort Jawai', 'Jawai', 'balanced')
ON CONFLICT (id) DO NOTHING;

-- Competitors
INSERT INTO competitors (id, hotel_id, competitor_name, website_url)
VALUES
  ('c1010000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ITC Grand Goa', 'https://www.itchotels.com/in/en/itcgrandgoa-goa'),
  ('c1010000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Grand Hyatt Goa', 'https://www.hyatt.com/grand-hyatt/en-US/goagh-grand-hyatt-goa'),
  ('c1010000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'The Leela Goa', 'https://www.theleela.com/the-leela-goa'),
  ('c1010000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Taj Exotica Resort & Spa Goa', 'https://www.tajhotels.com/en-in/taj/taj-exotica-goa'),

  ('c1020000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111112', 'Novotel Goa Candolim', 'https://all.accor.com/hotel/7559/index.en.shtml'),
  ('c1020000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111112', 'Holiday Inn Goa Candolim', 'https://www.ihg.com/holidayinn'),
  ('c1020000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111112', 'Radisson Goa Candolim', 'https://www.radissonhotels.com/en-us/hotels/radisson-goa-candolim'),
  ('c1020000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111112', 'Country Inn & Suites Candolim', 'https://www.radissonhotels.com/en-us/hotels/country-inn-goa-candolim'),
  ('c1030000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'Larisa Beach Resort', 'https://www.larisahotels.com/larisa-beach-resort-goa'),
  ('c1030000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'Marbela Beach Resort', 'https://marbela.in'),
  ('c1030000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Montego Bay Beach Village', 'https://www.montegobaybeachvillage.com'),
  ('c1030000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 'White Woods Resort & Spa', 'https://whitewoodsgoa.com'),

  ('c2010000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222221', 'Trident Nariman Point', 'https://www.tridenthotels.com/hotels-in-mumbai-nariman-point'),
  ('c2010000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222221', 'InterContinental Marine Drive', 'https://www.ihg.com/intercontinental'),
  ('c2010000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222221', 'The Oberoi Mumbai', 'https://www.oberoihotels.com/hotels-in-mumbai-oberoi'),
  ('c2010000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222221', 'Sea Green South Hotel', 'https://www.seagreenhotel.com'),

  ('c2020000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Trident Bandra Kurla', 'https://www.tridenthotels.com/hotels-in-mumbai-bandra-kurla'),
  ('c2020000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Sofitel Mumbai BKC', 'https://all.accor.com/hotel/6451/index.en.shtml'),
  ('c2020000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Hotel BKC Palace', 'https://www.hotelbkc.in'),
  ('c2020000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Indie Stays BKC', 'https://indiestays.com'),
  ('d4010000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'Trident Nariman Point', 'https://www.tridenthotels.com/hotels-in-mumbai-nariman-point'),
  ('d4010000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'InterContinental Marine Drive', 'https://www.ihg.com/intercontinental'),
  ('d4010000-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 'Taj Mahal Palace Mumbai', 'https://www.tajhotels.com/en-in/taj/taj-mahal-palace-mumbai'),
  ('d4010000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 'The St. Regis Mumbai', 'https://www.marriott.com/en-us/hotels/bomxr-the-st-regis-mumbai'),

  ('e5010000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'Ajit Bhawan Jodhpur', 'https://www.ajitbhawan.com'),
  ('e5010000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', 'Taj Hari Mahal Jodhpur', 'https://www.tajhotels.com/en-in/taj/taj-hari-mahal-jodhpur'),
  ('e5010000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555', 'Ratan Vilas', 'https://www.ratanvilas.com'),
  ('e5010000-0000-4000-8000-000000000004', '55555555-5555-4555-8555-555555555555', 'Indana Palace Jodhpur', 'https://www.indanahotels.com/indana-palace-jodhpur'),

  ('e6010000-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 'The Westin Pushkar Resort & Spa', 'https://www.marriott.com/en-us/hotels/jaiwi-the-westin-pushkar-resort-and-spa'),
  ('e6010000-0000-4000-8000-000000000002', '66666666-6666-4666-8666-666666666666', 'Pushkara Resort & Spa', 'https://pushkararesort.com'),
  ('e6010000-0000-4000-8000-000000000003', '66666666-6666-4666-8666-666666666666', 'Ananta Spa & Resorts Pushkar', 'https://www.anantaresorts.com/pushkar'),
  ('e6010000-0000-4000-8000-000000000004', '66666666-6666-4666-8666-666666666666', 'Pushkar Bagh Resort', 'https://www.pushkarbagh.com'),

  ('e7010000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'Jawai Nature Stay', 'https://www.jawainaturestay.com'),
  ('e7010000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', 'Jawai Wildness Lodge', 'https://www.jawaiswildnesslodge.com'),
  ('e7010000-0000-4000-8000-000000000003', '77777777-7777-4777-8777-777777777777', 'Lords Eco Inn Jawai', 'https://www.lordshotels.com/hotels/lords-eco-inn-jawai'),
  ('e7010000-0000-4000-8000-000000000004', '77777777-7777-4777-8777-777777777777', 'Jawai Sagar Resort', 'https://www.jawaisagar.com')
ON CONFLICT (id) DO NOTHING;

-- Competitor pricing simulation (today vs 48h ago)
DELETE FROM competitor_rates
WHERE hotel_id IN (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111112',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222221',
  '22222222-2222-4222-8222-222222222222',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777'
)
AND checkin_date = CURRENT_DATE + 7;

INSERT INTO competitor_rates (hotel_id, competitor_id, checkin_date, price_today, price_48h_ago, scraped_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'c1010000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 11500, 10200, NOW() - INTERVAL '1 hour'),
  ('11111111-1111-4111-8111-111111111111', 'c1010000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 11100, 10000, NOW() - INTERVAL '1 hour'),
  ('11111111-1111-4111-8111-111111111111', 'c1010000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 11800, 10700, NOW() - INTERVAL '1 hour'),
  ('11111111-1111-4111-8111-111111111111', 'c1010000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 11250, 10150, NOW() - INTERVAL '1 hour'),

  ('11111111-1111-4111-8111-111111111112', 'c1020000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 9800, 9700, NOW() - INTERVAL '1 hour'),
  ('11111111-1111-4111-8111-111111111112', 'c1020000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 9950, 9800, NOW() - INTERVAL '1 hour'),
  ('11111111-1111-4111-8111-111111111112', 'c1020000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 10100, 10050, NOW() - INTERVAL '1 hour'),
  ('11111111-1111-4111-8111-111111111112', 'c1020000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 9900, 9850, NOW() - INTERVAL '1 hour'),
  ('33333333-3333-4333-8333-333333333333', 'c1030000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 10400, 9600, NOW() - INTERVAL '1 hour'),
  ('33333333-3333-4333-8333-333333333333', 'c1030000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 10600, 9800, NOW() - INTERVAL '1 hour'),
  ('33333333-3333-4333-8333-333333333333', 'c1030000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 10150, 9400, NOW() - INTERVAL '1 hour'),
  ('33333333-3333-4333-8333-333333333333', 'c1030000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 10300, 9500, NOW() - INTERVAL '1 hour'),
  ('44444444-4444-4444-8444-444444444444', 'd4010000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 17100, 16350, NOW() - INTERVAL '1 hour'),
  ('44444444-4444-4444-8444-444444444444', 'd4010000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 18250, 17300, NOW() - INTERVAL '1 hour'),
  ('44444444-4444-4444-8444-444444444444', 'd4010000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 19800, 18600, NOW() - INTERVAL '1 hour'),
  ('44444444-4444-4444-8444-444444444444', 'd4010000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 17600, 16750, NOW() - INTERVAL '1 hour'),

  ('22222222-2222-4222-8222-222222222221', 'c2010000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 13800, 13100, NOW() - INTERVAL '1 hour'),
  ('22222222-2222-4222-8222-222222222221', 'c2010000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 14200, 13600, NOW() - INTERVAL '1 hour'),
  ('22222222-2222-4222-8222-222222222221', 'c2010000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 13950, 13400, NOW() - INTERVAL '1 hour'),
  ('22222222-2222-4222-8222-222222222221', 'c2010000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 14100, 13500, NOW() - INTERVAL '1 hour'),

  ('22222222-2222-4222-8222-222222222222', 'c2020000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 9000, 9150, NOW() - INTERVAL '1 hour'),
  ('22222222-2222-4222-8222-222222222222', 'c2020000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 8900, 9100, NOW() - INTERVAL '1 hour'),
  ('22222222-2222-4222-8222-222222222222', 'c2020000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 9100, 9250, NOW() - INTERVAL '1 hour'),
  ('22222222-2222-4222-8222-222222222222', 'c2020000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 9050, 9200, NOW() - INTERVAL '1 hour'),

  ('55555555-5555-4555-8555-555555555555', 'e5010000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 12750, 12150, NOW() - INTERVAL '1 hour'),
  ('55555555-5555-4555-8555-555555555555', 'e5010000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 13450, 12800, NOW() - INTERVAL '1 hour'),
  ('55555555-5555-4555-8555-555555555555', 'e5010000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 11422, 10950, NOW() - INTERVAL '1 hour'),
  ('55555555-5555-4555-8555-555555555555', 'e5010000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 9625, 9450, NOW() - INTERVAL '1 hour'),

  ('66666666-6666-4666-8666-666666666666', 'e6010000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 16750, 15900, NOW() - INTERVAL '1 hour'),
  ('66666666-6666-4666-8666-666666666666', 'e6010000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 21898, 21000, NOW() - INTERVAL '1 hour'),
  ('66666666-6666-4666-8666-666666666666', 'e6010000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 6440, 6200, NOW() - INTERVAL '1 hour'),
  ('66666666-6666-4666-8666-666666666666', 'e6010000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 9500, 9200, NOW() - INTERVAL '1 hour'),

  ('77777777-7777-4777-8777-777777777777', 'e7010000-0000-4000-8000-000000000001', CURRENT_DATE + 7, 10500, 9900, NOW() - INTERVAL '1 hour'),
  ('77777777-7777-4777-8777-777777777777', 'e7010000-0000-4000-8000-000000000002', CURRENT_DATE + 7, 12999, 12450, NOW() - INTERVAL '1 hour'),
  ('77777777-7777-4777-8777-777777777777', 'e7010000-0000-4000-8000-000000000003', CURRENT_DATE + 7, 9999, 9600, NOW() - INTERVAL '1 hour'),
  ('77777777-7777-4777-8777-777777777777', 'e7010000-0000-4000-8000-000000000004', CURRENT_DATE + 7, 11800, 11300, NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- Hotel prices for market position
DELETE FROM hotel_rate_snapshots
WHERE hotel_id IN (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111112',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222221',
  '22222222-2222-4222-8222-222222222222',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777'
)
AND checkin_date = CURRENT_DATE + 7;

INSERT INTO hotel_rate_snapshots (hotel_id, checkin_date, price, captured_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', CURRENT_DATE + 7, 11000, NOW()),
  ('11111111-1111-4111-8111-111111111112', CURRENT_DATE + 7, 10000, NOW()),
  ('33333333-3333-4333-8333-333333333333', CURRENT_DATE + 7, 6689, NOW()),
  ('44444444-4444-4444-8444-444444444444', CURRENT_DATE + 7, 17850, NOW()),
  ('22222222-2222-4222-8222-222222222221', CURRENT_DATE + 7, 13700, NOW()),
  ('22222222-2222-4222-8222-222222222222', CURRENT_DATE + 7, 8900, NOW()),
  ('55555555-5555-4555-8555-555555555555', CURRENT_DATE + 7, 17595, NOW()),
  ('66666666-6666-4666-8666-666666666666', CURRENT_DATE + 7, 29132, NOW()),
  ('77777777-7777-4777-8777-777777777777', CURRENT_DATE + 7, 16145, NOW())
ON CONFLICT DO NOTHING;

-- Airfare trends
INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Goa', CURRENT_DATE - g, 5900 + (g * 16)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Mumbai', CURRENT_DATE - g, 4300 + (g * 7)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Jodhpur', CURRENT_DATE - g, 4800 + (g * 9)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Pushkar', CURRENT_DATE - g, 4700 + (g * 8)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Jawai', CURRENT_DATE - g, 5200 + (g * 11)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Nainital', CURRENT_DATE - g, 5400 + (g * 9)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Corbett', CURRENT_DATE - g, 5700 + (g * 10)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Mukeshwar', CURRENT_DATE - g, 5600 + (g * 9)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

INSERT INTO airfare_data (city, date, avg_price)
SELECT 'Mukteshwar', CURRENT_DATE - g, 5600 + (g * 9)
FROM generate_series(0, 20) AS g
ON CONFLICT (city, date) DO UPDATE SET avg_price = EXCLUDED.avg_price;

-- Holiday fixtures
INSERT INTO holidays (city, holiday_date, holiday_name, holiday_type)
VALUES
  ('Goa', CURRENT_DATE + 2, 'Carnival Weekend', 'long_weekend'),
  ('Goa', CURRENT_DATE + 10, 'Goa Foundation Day', 'public'),
  ('Mumbai', CURRENT_DATE + 5, 'Maharashtra Public Holiday', 'public'),
  ('Mumbai', CURRENT_DATE + 12, 'City Long Weekend', 'long_weekend'),
  ('Jodhpur', CURRENT_DATE + 4, 'Rajasthan Heritage Weekend', 'long_weekend'),
  ('Jodhpur', CURRENT_DATE + 11, 'Marwar Regional Holiday', 'regional'),
  ('Pushkar', CURRENT_DATE + 6, 'Temple Fair Weekend', 'long_weekend'),
  ('Pushkar', CURRENT_DATE + 13, 'Pushkar Pilgrim Movement', 'regional'),
  ('Jawai', CURRENT_DATE + 3, 'Safari Long Weekend', 'long_weekend'),
  ('Jawai', CURRENT_DATE + 9, 'Rural Festival Window', 'regional'),
  ('Nainital', CURRENT_DATE + 4, 'Nainital Weekend Surge', 'long_weekend'),
  ('Nainital', CURRENT_DATE + 11, 'Kumaon Regional Holiday', 'regional'),
  ('Corbett', CURRENT_DATE + 3, 'Corbett Safari Weekend', 'long_weekend'),
  ('Corbett', CURRENT_DATE + 12, 'Uttarakhand Public Holiday', 'public'),
  ('Mukeshwar', CURRENT_DATE + 5, 'Hill Escape Long Weekend', 'long_weekend'),
  ('Mukeshwar', CURRENT_DATE + 13, 'Mukeshwar Regional Day', 'regional'),
  ('Mukteshwar', CURRENT_DATE + 5, 'Hill Escape Long Weekend', 'long_weekend'),
  ('Mukteshwar', CURRENT_DATE + 13, 'Mukteshwar Regional Day', 'regional')
ON CONFLICT DO NOTHING;

-- ---------------------------
-- Radar v3 geo normalization
-- ---------------------------
INSERT INTO states (id, name, country, timezone)
VALUES
  ('90000000-0000-4000-8000-000000000001', 'Goa', 'India', 'Asia/Kolkata'),
  ('90000000-0000-4000-8000-000000000002', 'Maharashtra', 'India', 'Asia/Kolkata'),
  ('90000000-0000-4000-8000-000000000003', 'Rajasthan', 'India', 'Asia/Kolkata'),
  ('90000000-0000-4000-8000-000000000004', 'Uttarakhand', 'India', 'Asia/Kolkata')
ON CONFLICT (id) DO NOTHING;

INSERT INTO holiday_calendars (id, name)
VALUES
  ('91000000-0000-4000-8000-000000000001', 'Goa Leisure Calendar'),
  ('91000000-0000-4000-8000-000000000002', 'Mumbai Business Calendar'),
  ('91000000-0000-4000-8000-000000000003', 'Rajasthan Heritage Calendar'),
  ('91000000-0000-4000-8000-000000000004', 'Uttarakhand Hill Calendar')
ON CONFLICT (id) DO NOTHING;

INSERT INTO season_profiles (
  id, name, description, monthly_weights_json, weekend_multiplier, volatility_multiplier,
  event_sensitivity, compression_sensitivity, confidence_bias
)
VALUES
  (
    '92000000-0000-4000-8000-000000000001',
    'Urban Business',
    'Business travel cycles with weekday premium.',
    '{"jan":56,"feb":57,"mar":58,"apr":57,"may":55,"jun":54,"jul":55,"aug":56,"sep":57,"oct":58,"nov":60,"dec":59}'::jsonb,
    1.08, 1.00, 1.05, 1.00, 2.00
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'Coastal Leisure',
    'Leisure demand with pronounced seasonality.',
    '{"jan":68,"feb":72,"mar":66,"apr":54,"may":40,"jun":28,"jul":24,"aug":30,"sep":42,"oct":58,"nov":80,"dec":88}'::jsonb,
    1.12, 1.00, 1.08, 1.10, 1.00
  ),
  (
    '92000000-0000-4000-8000-000000000003',
    'Heritage Desert',
    'Winter-heavy heritage and experiential demand.',
    '{"jan":64,"feb":67,"mar":70,"apr":62,"may":54,"jun":44,"jul":39,"aug":42,"sep":53,"oct":70,"nov":88,"dec":84}'::jsonb,
    1.09, 1.02, 1.10, 1.12, 1.50
  ),
  (
    '92000000-0000-4000-8000-000000000004',
    'Hill Leisure',
    'Seasonal hill demand with summer and holiday spikes.',
    '{"jan":58,"feb":60,"mar":63,"apr":69,"may":78,"jun":82,"jul":66,"aug":61,"sep":64,"oct":68,"nov":62,"dec":71}'::jsonb,
    1.10, 1.04, 1.07, 1.05, 1.00
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO cities (id, name, state_id, airport_code, season_profile_id, holiday_calendar_id)
VALUES
  ('93000000-0000-4000-8000-000000000001', 'Goa', '90000000-0000-4000-8000-000000000001', 'GOI', '92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002', 'Mumbai', '90000000-0000-4000-8000-000000000002', 'BOM', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002'),
  ('93000000-0000-4000-8000-000000000003', 'Jodhpur', '90000000-0000-4000-8000-000000000003', 'JDH', '92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003'),
  ('93000000-0000-4000-8000-000000000004', 'Pushkar', '90000000-0000-4000-8000-000000000003', 'KQH', '92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003'),
  ('93000000-0000-4000-8000-000000000005', 'Jawai', '90000000-0000-4000-8000-000000000003', 'UDR', '92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003'),
  ('93000000-0000-4000-8000-000000000006', 'Jaipur', '90000000-0000-4000-8000-000000000003', 'JAI', '92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003'),
  ('93000000-0000-4000-8000-000000000007', 'Nainital', '90000000-0000-4000-8000-000000000004', 'PGH', '92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004'),
  ('93000000-0000-4000-8000-000000000008', 'Corbett', '90000000-0000-4000-8000-000000000004', 'PGH', '92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004'),
  ('93000000-0000-4000-8000-000000000009', 'Mukeshwar', '90000000-0000-4000-8000-000000000004', 'PGH', '92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004'),
  ('93000000-0000-4000-8000-000000000010', 'Mukteshwar', '90000000-0000-4000-8000-000000000004', 'PGH', '92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004')
ON CONFLICT (name) DO UPDATE
SET
  state_id = EXCLUDED.state_id,
  airport_code = EXCLUDED.airport_code,
  season_profile_id = EXCLUDED.season_profile_id,
  holiday_calendar_id = EXCLUDED.holiday_calendar_id;

UPDATE hotels h
SET city_id = c.id
FROM cities c
WHERE c.name = h.city
  AND h.city_id IS DISTINCT FROM c.id;

UPDATE hotels h
SET
  last_calculated_at = NOW(),
  comp_set_json = COALESCE(comp.json_value, '[]'::jsonb)
FROM (
  SELECT hotel_id, jsonb_agg(competitor_name ORDER BY competitor_name) AS json_value
  FROM competitors
  GROUP BY hotel_id
) comp
WHERE comp.hotel_id = h.id;

UPDATE hotels
SET
  base_price_min = LEAST(base_price_min, 4500),
  base_price_max = GREATEST(base_price_max, 40000)
WHERE city IN ('Goa', 'Mumbai', 'Jodhpur', 'Pushkar', 'Jawai');

INSERT INTO city_weights (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES
  ('Nainital', 0.39, 0.24, 0.12, 0.25),
  ('Corbett', 0.40, 0.25, 0.12, 0.23),
  ('Mukeshwar', 0.38, 0.24, 0.13, 0.25),
  ('Mukteshwar', 0.38, 0.24, 0.13, 0.25)
ON CONFLICT (city) DO UPDATE
SET competitor_weight = EXCLUDED.competitor_weight,
    holiday_weight = EXCLUDED.holiday_weight,
    airfare_weight = EXCLUDED.airfare_weight,
    season_weight = EXCLUDED.season_weight,
    updated_at = NOW();

-- ---------------------------
-- Radar v3 auth + RBAC seeds
-- Password policy for seed users:
-- super_admin/admin: Admin@123
-- hotel_user: Hotel@123
-- hash = sha256(password || 'radar-v3-pepper')
-- ---------------------------
INSERT INTO users (id, email, password_hash, role, active, full_name, mobile_no)
VALUES
  ('94000000-0000-4000-8000-000000000001', 'super_admin@radar.ai', encode(digest('Admin@123' || 'radar-v3-pepper', 'sha256'), 'hex'), 'super_admin', TRUE, 'Super Admin', '9990000001'),
  ('94000000-0000-4000-8000-000000000002', 'admin@radar.ai', encode(digest('Admin@123' || 'radar-v3-pepper', 'sha256'), 'hex'), 'admin', TRUE, 'Platform Admin', '9990000002'),
  ('94000000-0000-4000-8000-000000000003', 'rohet@radar.ai', encode(digest('Hotel@123' || 'radar-v3-pepper', 'sha256'), 'hex'), 'hotel_user', TRUE, 'Rohet RM', '9990000003'),
  ('94000000-0000-4000-8000-000000000004', 'mayagarh@radar.ai', encode(digest('Hotel@123' || 'radar-v3-pepper', 'sha256'), 'hex'), 'hotel_user', TRUE, 'Mayagarh RM', '9990000004'),
  ('94000000-0000-4000-8000-000000000005', 'jwild@radar.ai', encode(digest('Hotel@123' || 'radar-v3-pepper', 'sha256'), 'hex'), 'hotel_user', TRUE, 'Jwild RM', '9990000005')
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    active = EXCLUDED.active,
    full_name = EXCLUDED.full_name,
    mobile_no = EXCLUDED.mobile_no;

INSERT INTO hotel_users (user_id, hotel_id)
VALUES
  ('94000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555'),
  ('94000000-0000-4000-8000-000000000004', '66666666-6666-4666-8666-666666666666'),
  ('94000000-0000-4000-8000-000000000005', '77777777-7777-4777-8777-777777777777')
ON CONFLICT DO NOTHING;

-- ---------------------------
-- Calibration settings (configurable thresholds)
-- ---------------------------
INSERT INTO calibration_settings (key, value_json)
VALUES
  ('global.thresholds', '{"scoreChange":12,"competitorMovement":8,"marketDeviation":15,"surgeWindowDays":3}'::jsonb),
  ('global.confidence', '{"ceiling":95,"defaultBias":0,"min":45}'::jsonb),
  ('global.volatility', '{"stableMax":35,"volatileMax":70}'::jsonb),
  ('global.riskMultipliers', '{"overpricedPenalty":1.2,"softDemandIncreasePenalty":1.1}'::jsonb),
  ('global.weights.default', '{"competitor_weight":0.40,"holiday_weight":0.30,"airfare_weight":0.15,"season_weight":0.15}'::jsonb),
  ('security.rateLimit', '{"windowMs":60000,"maxRecalculatePerWindow":3}'::jsonb),
  ('compression.thresholds', '{"lowMax":45,"moderateMax":70,"priceVacuumPct":12,"opportunityMinFactor":0.95,"opportunityMaxFactor":1.05}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = NOW();
