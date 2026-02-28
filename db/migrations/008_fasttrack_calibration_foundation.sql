-- Fast-track calibration foundation:
-- 1) ingest real outcomes (ADR/occupancy/pickup)
-- 2) label alert quality (useful/noise)
-- 3) deterministic calibration run logs
-- 4) canary overrides per hotel

CREATE TABLE IF NOT EXISTS hotel_daily_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  outcome_date DATE NOT NULL,
  actual_adr NUMERIC(10,2) NOT NULL CHECK (actual_adr >= 0),
  occupancy_pct NUMERIC(5,2) CHECK (occupancy_pct >= 0 AND occupancy_pct <= 100),
  pickup_rooms INTEGER CHECK (pickup_rooms >= 0),
  source TEXT NOT NULL DEFAULT 'manual_csv',
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, outcome_date)
);

CREATE INDEX IF NOT EXISTS idx_hotel_daily_outcomes_hotel_date
  ON hotel_daily_outcomes(hotel_id, outcome_date DESC);

CREATE TABLE IF NOT EXISTS alert_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL CHECK (feedback IN ('useful', 'noise', 'ignore')),
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alert_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_feedback_hotel_created
  ON alert_feedback(hotel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hotel_canary_calibration (
  hotel_id UUID PRIMARY KEY REFERENCES hotels(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  override_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('city', 'global')),
  scope_value TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'skipped', 'failed')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_runs_scope_created
  ON calibration_runs(scope_type, scope_value, created_at DESC);
