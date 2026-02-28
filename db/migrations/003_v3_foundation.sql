CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, country)
);

CREATE TABLE IF NOT EXISTS holiday_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS season_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  monthly_weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  weekend_multiplier NUMERIC(8,4) NOT NULL DEFAULT 1.00,
  volatility_multiplier NUMERIC(8,4) NOT NULL DEFAULT 1.00,
  event_sensitivity NUMERIC(8,4) NOT NULL DEFAULT 1.00,
  compression_sensitivity NUMERIC(8,4) NOT NULL DEFAULT 1.00,
  confidence_bias NUMERIC(8,4) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE RESTRICT,
  airport_code TEXT,
  season_profile_id UUID REFERENCES season_profiles(id) ON DELETE SET NULL,
  holiday_calendar_id UUID REFERENCES holiday_calendars(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id) ON DELETE SET NULL;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS room_count INTEGER NOT NULL DEFAULT 40;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS base_price_min NUMERIC(10,2) NOT NULL DEFAULT 1000;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS base_price_max NUMERIC(10,2) NOT NULL DEFAULT 100000;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS comp_set_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active'
  CHECK (subscription_status IN ('active', 'paused', 'trial', 'cancelled'));
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS last_calculated_at TIMESTAMPTZ;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS name TEXT;

UPDATE hotels SET name = hotel_name WHERE name IS NULL OR name = '';

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'hotel_user')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotel_users (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, hotel_id)
);

CREATE TABLE IF NOT EXISTS intelligence_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  direction_accuracy NUMERIC(8,2) NOT NULL DEFAULT 0,
  alert_precision NUMERIC(8,2) NOT NULL DEFAULT 0,
  position_improvement_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  rolling_accuracy_30d NUMERIC(8,2) NOT NULL DEFAULT 0,
  stability_deviation NUMERIC(8,2) NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id)
);

CREATE TABLE IF NOT EXISTS intelligence_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  trigger_source TEXT NOT NULL,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  engine_version TEXT NOT NULL DEFAULT 'v3.0.0',
  result_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cities_state_id ON cities(state_id);
CREATE INDEX IF NOT EXISTS idx_hotels_city_id ON hotels(city_id);
CREATE INDEX IF NOT EXISTS idx_hotel_users_hotel_id ON hotel_users(hotel_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_audit_hotel_created ON intelligence_audit_log(hotel_id, created_at DESC);
