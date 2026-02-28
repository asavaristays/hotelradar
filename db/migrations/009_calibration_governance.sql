-- Governance upgrades for fast-track calibration:
-- - model_versions table
-- - richer calibration run logging fields
-- - canary override linked to model version

CREATE TABLE IF NOT EXISTS model_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  weight_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parent_version UUID REFERENCES model_versions(version_id) ON DELETE SET NULL,
  calibration_run_id UUID REFERENCES calibration_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'canary' CHECK (status IN ('active', 'canary', 'reverted')),
  accuracy_baseline NUMERIC(8,2),
  accuracy_latest NUMERIC(8,2),
  reverted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (city_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_model_versions_city_created
  ON model_versions(city_id, created_at DESC);

ALTER TABLE hotel_canary_calibration
  ADD COLUMN IF NOT EXISTS model_version_id UUID REFERENCES model_versions(version_id) ON DELETE SET NULL;

ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS proposed_weights JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS applied_weights JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS clamped_weights JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS outcome_sample_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS version_created BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS revert_flag BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS accuracy_before NUMERIC(8,2);
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS accuracy_after NUMERIC(8,2);

ALTER TABLE calibration_runs DROP CONSTRAINT IF EXISTS calibration_runs_status_check;
ALTER TABLE calibration_runs
  ADD CONSTRAINT calibration_runs_status_check
  CHECK (status IN ('completed', 'skipped', 'failed', 'insufficient_data', 'reverted'));
