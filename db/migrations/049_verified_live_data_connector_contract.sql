DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'realtime_signal_observations_source_type_check'
  ) THEN
    ALTER TABLE realtime_signal_observations
      DROP CONSTRAINT realtime_signal_observations_source_type_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'realtime_signal_observations_signal_type_check'
  ) THEN
    ALTER TABLE realtime_signal_observations
      DROP CONSTRAINT realtime_signal_observations_signal_type_check;
  END IF;
END $$;

ALTER TABLE realtime_signal_observations
  ADD CONSTRAINT realtime_signal_observations_source_type_check
  CHECK (
    source_type IN (
      'official',
      'ota',
      'competitor',
      'airfare',
      'event',
      'weather',
      'search',
      'digital',
      'pms',
      'review',
      'social',
      'system'
    )
  );

ALTER TABLE realtime_signal_observations
  ADD CONSTRAINT realtime_signal_observations_signal_type_check
  CHECK (
    signal_type IN (
      'hotel_rate',
      'ota_rate',
      'competitor_rate',
      'airfare_trend',
      'event_signal',
      'weather_signal',
      'search_trend',
      'digital_asset_signal',
      'pms_pickup',
      'review_velocity',
      'social_signal',
      'freshness'
    )
  );

CREATE INDEX IF NOT EXISTS idx_realtime_observations_source_health
  ON realtime_signal_observations(source_type, signal_type, freshness_expires_at DESC, captured_at DESC);
