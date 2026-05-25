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
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced' CHECK (alert_sensitivity IN ('conservative', 'balanced', 'aggressive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT,
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  google_rating NUMERIC(3,2),
  review_count INTEGER,
  has_chatbot BOOLEAN,
  website TEXT,
  phone TEXT,
  google_maps_url TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_hotels_google_rating_check
    CHECK (google_rating IS NULL OR (google_rating >= 0 AND google_rating <= 5.00)),
  CONSTRAINT market_hotels_review_count_check
    CHECK (review_count IS NULL OR review_count >= 0),
  CONSTRAINT market_hotels_hotel_name_city_unique
    UNIQUE (hotel_name, city)
);

CREATE TABLE IF NOT EXISTS market_hotel_neighbors (
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  neighbor_hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  distance_km NUMERIC(8,3) NOT NULL CHECK (distance_km >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hotel_id, neighbor_hotel_id),
  CONSTRAINT market_hotel_neighbors_not_self
    CHECK (hotel_id <> neighbor_hotel_id)
);

CREATE TABLE IF NOT EXISTS market_hotel_signals (
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('HIGH_REVIEW_ACTIVITY', 'REPUTATION_WEAKNESS', 'CHATBOT_GAP', 'OTA_DEPENDENCE', 'DEMAND_SURGE_CLUSTER', 'PRICE_PRESSURE', 'EVENT_DEMAND_ZONE', 'WEDDING_DEMAND_ZONE', 'CORPORATE_EVENT_CLUSTER', 'TOURISM_SPIKE', 'AIRPORT_DEMAND', 'WEEKEND_COMPRESSION', 'FESTIVAL_DEMAND')),
  signal_strength NUMERIC(10,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hotel_id, signal_type)
);

CREATE TABLE IF NOT EXISTS market_opportunity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram')),
  signal_type TEXT NOT NULL,
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  signal_strength NUMERIC(10,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS market_ranked_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram')),
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  score NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS market_hotel_benchmarks (
  hotel_id UUID PRIMARY KEY REFERENCES market_hotels(id) ON DELETE CASCADE,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram')),
  nearby_hotel_count INTEGER NOT NULL DEFAULT 0 CHECK (nearby_hotel_count >= 0),
  avg_nearby_rating NUMERIC(6,3),
  avg_nearby_reviews NUMERIC(12,3),
  nearby_signal_count INTEGER NOT NULL DEFAULT 0 CHECK (nearby_signal_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_opportunity_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  opportunity_score NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_status BOOLEAN NOT NULL DEFAULT FALSE
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
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  date DATE NOT NULL,
  avg_price NUMERIC(10,2) NOT NULL CHECK (avg_price >= 0),
  price_change_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
  UNIQUE (city, date)
);

CREATE TABLE IF NOT EXISTS city_weight_configs (
  city TEXT PRIMARY KEY CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  competitor_weight NUMERIC(5,4) NOT NULL,
  holiday_weight NUMERIC(5,4) NOT NULL,
  airfare_weight NUMERIC(5,4) NOT NULL,
  season_weight NUMERIC(5,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL CHECK (holiday_type IN ('major', 'minor')),
  UNIQUE (city, holiday_date, holiday_name)
);

CREATE TABLE IF NOT EXISTS city_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
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
CREATE INDEX IF NOT EXISTS idx_market_hotels_city_hotel_name ON market_hotels(city, hotel_name);
CREATE INDEX IF NOT EXISTS idx_market_hotels_updated_at ON market_hotels(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_hotels_google_place_id
  ON market_hotels(google_place_id)
  WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_hotel_neighbors_hotel_id
  ON market_hotel_neighbors(hotel_id, distance_km);
CREATE INDEX IF NOT EXISTS idx_market_hotel_neighbors_neighbor_hotel_id
  ON market_hotel_neighbors(neighbor_hotel_id);
CREATE INDEX IF NOT EXISTS idx_market_hotel_signals_signal_type
  ON market_hotel_signals(signal_type, signal_strength DESC);
CREATE INDEX IF NOT EXISTS idx_market_opportunity_feed_city_created
  ON market_opportunity_feed(city, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_opportunity_feed_signal_type
  ON market_opportunity_feed(signal_type, signal_strength DESC);
CREATE INDEX IF NOT EXISTS idx_market_ranked_opportunities_city_score
  ON market_ranked_opportunities(city, score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_ranked_opportunities_hotel
  ON market_ranked_opportunities(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_hotel_benchmarks_city
  ON market_hotel_benchmarks(city, nearby_hotel_count DESC, nearby_signal_count DESC);
CREATE INDEX IF NOT EXISTS idx_market_opportunity_notifications_hotel_created
  ON market_opportunity_notifications(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_opportunity_notifications_signal
  ON market_opportunity_notifications(signal_type, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_rates_hotel_scraped ON competitor_rates(hotel_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_rates_hotel_captured ON hotel_rate_snapshots(hotel_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_scores_hotel_created ON demand_scores(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_hotel_created ON alerts(hotel_id, created_at DESC);

INSERT INTO city_weight_configs (city, competitor_weight, holiday_weight, airfare_weight, season_weight)
VALUES
  ('Goa', 0.45, 0.25, 0.20, 0.10),
  ('Mumbai', 0.40, 0.30, 0.15, 0.15),
  ('Jaipur', 0.42, 0.26, 0.14, 0.18)
ON CONFLICT (city) DO UPDATE
SET competitor_weight = EXCLUDED.competitor_weight,
    holiday_weight = EXCLUDED.holiday_weight,
    airfare_weight = EXCLUDED.airfare_weight,
    season_weight = EXCLUDED.season_weight,
    updated_at = NOW();
