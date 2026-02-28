CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai')),
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced' CHECK (alert_sensitivity IN ('conservative', 'balanced', 'aggressive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  website_url TEXT
);

CREATE TABLE IF NOT EXISTS competitor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
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
  price_change_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
  UNIQUE (city, date)
);

CREATE TABLE IF NOT EXISTS city_weight_configs (
  city TEXT PRIMARY KEY CHECK (city IN ('Goa', 'Mumbai')),
  competitor_weight NUMERIC(5,4) NOT NULL,
  holiday_weight NUMERIC(5,4) NOT NULL,
  airfare_weight NUMERIC(5,4) NOT NULL,
  season_weight NUMERIC(5,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai')),
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL CHECK (holiday_type IN ('major', 'minor')),
  UNIQUE (city, holiday_date, holiday_name)
);

CREATE TABLE IF NOT EXISTS city_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai')),
  event_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  impact_score INTEGER NOT NULL DEFAULT 10 CHECK (impact_score BETWEEN 1 AND 30)
);

CREATE TABLE IF NOT EXISTS demand_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  level TEXT NOT NULL CHECK (level IN ('Low', 'Moderate', 'High', 'Surge')),
  recommendation TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  competitor_score NUMERIC(5,2),
  holiday_score NUMERIC(5,2),
  airfare_score NUMERIC(5,2),
  season_score NUMERIC(5,2)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_tenant_id ON hotels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_competitor_rates_hotel_scraped ON competitor_rates(hotel_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_rates_hotel_captured ON hotel_rate_snapshots(hotel_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_scores_hotel_created ON demand_scores(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_hotel_created ON alerts(hotel_id, created_at DESC);

INSERT INTO city_weight_configs (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES
  ('Goa', 0.45, 0.25, 0.20, 0.10),
  ('Mumbai', 0.40, 0.30, 0.15, 0.15)
ON CONFLICT (city) DO UPDATE
SET competitor_weight = EXCLUDED.competitor_weight,
    holiday_weight = EXCLUDED.holiday_weight,
    airfare_weight = EXCLUDED.airfare_weight,
    season_weight = EXCLUDED.season_weight,
    updated_at = NOW();
