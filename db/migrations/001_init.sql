CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai')),
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced' CHECK (alert_sensitivity IN ('conservative', 'balanced', 'aggressive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  price_today NUMERIC(10,2) NOT NULL CHECK (price_today >= 0),
  price_48h_ago NUMERIC(10,2) NOT NULL CHECK (price_48h_ago >= 0),
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotel_rate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS airfare_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai')),
  date DATE NOT NULL,
  avg_price NUMERIC(10,2) NOT NULL CHECK (avg_price >= 0),
  UNIQUE (city, date)
);

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai')),
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL CHECK (holiday_type IN ('public', 'regional', 'long_weekend')),
  UNIQUE (city, holiday_date, holiday_name)
);

CREATE TABLE IF NOT EXISTS city_weights (
  city TEXT PRIMARY KEY CHECK (city IN ('Goa', 'Mumbai')),
  competitor_weight NUMERIC(5,4) NOT NULL,
  holiday_weight NUMERIC(5,4) NOT NULL,
  airfare_weight NUMERIC(5,4) NOT NULL,
  season_weight NUMERIC(5,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demand_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  demand_score NUMERIC(5,2) NOT NULL CHECK (demand_score >= 0 AND demand_score <= 100),
  level TEXT NOT NULL CHECK (level IN ('Low', 'Moderate', 'High', 'Surge')),
  recommendation JSONB NOT NULL,
  confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  explanation JSONB NOT NULL,
  market_position JSONB NOT NULL,
  signals JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city);
CREATE INDEX IF NOT EXISTS idx_hotels_tenant_id ON hotels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_competitor_rates_hotel_scraped ON competitor_rates(hotel_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_rate_snapshots_hotel_captured ON hotel_rate_snapshots(hotel_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_scores_hotel_created ON demand_scores(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_hotel_created ON alerts(hotel_id, created_at DESC);

ALTER TABLE competitors ADD COLUMN IF NOT EXISTS url TEXT;
UPDATE competitors SET url = website_url WHERE url IS NULL;

ALTER TABLE airfare_data ADD COLUMN IF NOT EXISTS change_pct NUMERIC(8,2);

ALTER TABLE demand_scores ADD COLUMN IF NOT EXISTS score NUMERIC(5,2);
UPDATE demand_scores SET score = demand_score WHERE score IS NULL;

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS type TEXT;
UPDATE alerts SET type = alert_type WHERE type IS NULL;

UPDATE competitors
SET
  competitor_name = CASE id
    WHEN 'c1010000-0000-4000-8000-000000000001' THEN 'ITC Grand Goa'
    WHEN 'c1010000-0000-4000-8000-000000000002' THEN 'Grand Hyatt Goa'
    WHEN 'c1010000-0000-4000-8000-000000000003' THEN 'The Leela Goa'
    WHEN 'c1010000-0000-4000-8000-000000000004' THEN 'Taj Exotica Resort & Spa Goa'
    WHEN 'c1020000-0000-4000-8000-000000000001' THEN 'Novotel Goa Candolim'
    WHEN 'c1020000-0000-4000-8000-000000000002' THEN 'Holiday Inn Goa Candolim'
    WHEN 'c1020000-0000-4000-8000-000000000003' THEN 'Radisson Goa Candolim'
    WHEN 'c1020000-0000-4000-8000-000000000004' THEN 'Country Inn & Suites Candolim'
    WHEN 'c1030000-0000-4000-8000-000000000001' THEN 'Larisa Beach Resort'
    WHEN 'c1030000-0000-4000-8000-000000000002' THEN 'Marbela Beach Resort'
    WHEN 'c1030000-0000-4000-8000-000000000003' THEN 'Montego Bay Beach Village'
    WHEN 'c1030000-0000-4000-8000-000000000004' THEN 'White Woods Resort & Spa'
    WHEN 'c2010000-0000-4000-8000-000000000001' THEN 'Trident Nariman Point'
    WHEN 'c2010000-0000-4000-8000-000000000002' THEN 'InterContinental Marine Drive'
    WHEN 'c2010000-0000-4000-8000-000000000003' THEN 'The Oberoi Mumbai'
    WHEN 'c2010000-0000-4000-8000-000000000004' THEN 'Sea Green South Hotel'
    WHEN 'c2020000-0000-4000-8000-000000000001' THEN 'Trident Bandra Kurla'
    WHEN 'c2020000-0000-4000-8000-000000000002' THEN 'Sofitel Mumbai BKC'
    WHEN 'c2020000-0000-4000-8000-000000000003' THEN 'Hotel BKC Palace'
    WHEN 'c2020000-0000-4000-8000-000000000004' THEN 'Indie Stays BKC'
    ELSE competitor_name
  END,
  website_url = CASE id
    WHEN 'c1010000-0000-4000-8000-000000000001' THEN 'https://www.itchotels.com/in/en/itcgrandgoa-goa'
    WHEN 'c1010000-0000-4000-8000-000000000002' THEN 'https://www.hyatt.com/grand-hyatt/en-US/goagh-grand-hyatt-goa'
    WHEN 'c1010000-0000-4000-8000-000000000003' THEN 'https://www.theleela.com/the-leela-goa'
    WHEN 'c1010000-0000-4000-8000-000000000004' THEN 'https://www.tajhotels.com/en-in/taj/taj-exotica-goa'
    WHEN 'c1020000-0000-4000-8000-000000000001' THEN 'https://all.accor.com/hotel/7559/index.en.shtml'
    WHEN 'c1020000-0000-4000-8000-000000000002' THEN 'https://www.ihg.com/holidayinn'
    WHEN 'c1020000-0000-4000-8000-000000000003' THEN 'https://www.radissonhotels.com/en-us/hotels/radisson-goa-candolim'
    WHEN 'c1020000-0000-4000-8000-000000000004' THEN 'https://www.radissonhotels.com/en-us/hotels/country-inn-goa-candolim'
    WHEN 'c1030000-0000-4000-8000-000000000001' THEN 'https://www.larisahotels.com/larisa-beach-resort-goa'
    WHEN 'c1030000-0000-4000-8000-000000000002' THEN 'https://marbela.in'
    WHEN 'c1030000-0000-4000-8000-000000000003' THEN 'https://www.montegobaybeachvillage.com'
    WHEN 'c1030000-0000-4000-8000-000000000004' THEN 'https://whitewoodsgoa.com'
    WHEN 'c2010000-0000-4000-8000-000000000001' THEN 'https://www.tridenthotels.com/hotels-in-mumbai-nariman-point'
    WHEN 'c2010000-0000-4000-8000-000000000002' THEN 'https://www.ihg.com/intercontinental'
    WHEN 'c2010000-0000-4000-8000-000000000003' THEN 'https://www.oberoihotels.com/hotels-in-mumbai-oberoi'
    WHEN 'c2010000-0000-4000-8000-000000000004' THEN 'https://www.seagreenhotel.com'
    WHEN 'c2020000-0000-4000-8000-000000000001' THEN 'https://www.tridenthotels.com/hotels-in-mumbai-bandra-kurla'
    WHEN 'c2020000-0000-4000-8000-000000000002' THEN 'https://all.accor.com/hotel/6451/index.en.shtml'
    WHEN 'c2020000-0000-4000-8000-000000000003' THEN 'https://www.hotelbkc.in'
    WHEN 'c2020000-0000-4000-8000-000000000004' THEN 'https://indiestays.com'
    ELSE website_url
  END
WHERE id IN (
  'c1010000-0000-4000-8000-000000000001',
  'c1010000-0000-4000-8000-000000000002',
  'c1010000-0000-4000-8000-000000000003',
  'c1010000-0000-4000-8000-000000000004',
  'c1020000-0000-4000-8000-000000000001',
  'c1020000-0000-4000-8000-000000000002',
  'c1020000-0000-4000-8000-000000000003',
  'c1020000-0000-4000-8000-000000000004',
  'c1030000-0000-4000-8000-000000000001',
  'c1030000-0000-4000-8000-000000000002',
  'c1030000-0000-4000-8000-000000000003',
  'c1030000-0000-4000-8000-000000000004',
  'c2010000-0000-4000-8000-000000000001',
  'c2010000-0000-4000-8000-000000000002',
  'c2010000-0000-4000-8000-000000000003',
  'c2010000-0000-4000-8000-000000000004',
  'c2020000-0000-4000-8000-000000000001',
  'c2020000-0000-4000-8000-000000000002',
  'c2020000-0000-4000-8000-000000000003',
  'c2020000-0000-4000-8000-000000000004'
);

UPDATE competitors SET url = website_url WHERE url IS NULL OR url = '';

DELETE FROM competitor_rates
WHERE competitor_id IN (
  'c3010000-0000-4000-8000-000000000001',
  'c3010000-0000-4000-8000-000000000002',
  'c3010000-0000-4000-8000-000000000003',
  'c3010000-0000-4000-8000-000000000004'
);

DELETE FROM competitors
WHERE id IN (
  'c3010000-0000-4000-8000-000000000001',
  'c3010000-0000-4000-8000-000000000002',
  'c3010000-0000-4000-8000-000000000003',
  'c3010000-0000-4000-8000-000000000004'
);

INSERT INTO city_weights (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES
  ('Goa', 0.45, 0.25, 0.20, 0.10),
  ('Mumbai', 0.40, 0.30, 0.15, 0.15)
ON CONFLICT (city) DO UPDATE
SET competitor_weight = EXCLUDED.competitor_weight,
    holiday_weight = EXCLUDED.holiday_weight,
    airfare_weight = EXCLUDED.airfare_weight,
    season_weight = EXCLUDED.season_weight,
    updated_at = NOW();
