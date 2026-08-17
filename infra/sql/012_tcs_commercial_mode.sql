-- TCS rates + commercial mode (agent | principal)

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS tcs_bps INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_mode TEXT NOT NULL DEFAULT 'agent';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_commercial_mode_check'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_commercial_mode_check
      CHECK (commercial_mode IN ('agent', 'principal'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_tcs_bps_check'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_tcs_bps_check
      CHECK (tcs_bps >= 0 AND tcs_bps <= 1000);
  END IF;
END $$;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS commercial_mode TEXT,
  ADD COLUMN IF NOT EXISTS tcs_rate_bps INT,
  ADD COLUMN IF NOT EXISTS platform_turnover_paise BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_commercial_mode_check'
  ) THEN
    ALTER TABLE opportunities ADD CONSTRAINT opportunities_commercial_mode_check
      CHECK (commercial_mode IS NULL OR commercial_mode IN ('agent', 'principal'));
  END IF;
END $$;
