CREATE TABLE IF NOT EXISTS realtime_signal_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  source TEXT NOT NULL DEFAULT 'realtime-capture',
  cadence TEXT NOT NULL DEFAULT 'manual',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS realtime_signal_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES realtime_signal_runs(id) ON DELETE SET NULL,
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  checkin_date DATE,
  source_type TEXT NOT NULL CHECK (source_type IN ('official', 'ota', 'competitor', 'airfare', 'event', 'weather', 'system')),
  source_name TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('hotel_rate', 'ota_rate', 'competitor_rate', 'airfare_trend', 'event_signal', 'weather_signal', 'freshness')),
  value_numeric NUMERIC(12,2),
  value_text TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  proof_url TEXT,
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 70 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  freshness_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_realtime_observations_hotel_date
  ON realtime_signal_observations(hotel_id, checkin_date, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_realtime_observations_city_fresh
  ON realtime_signal_observations(city, freshness_expires_at DESC, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_realtime_signal_runs_started
  ON realtime_signal_runs(started_at DESC);
