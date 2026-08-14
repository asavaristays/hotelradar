CREATE TABLE IF NOT EXISTS verified_live_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  city TEXT,
  source_type TEXT NOT NULL CHECK (
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
  ),
  source_name TEXT NOT NULL,
  adapter_type TEXT NOT NULL DEFAULT 'json_manifest' CHECK (
    adapter_type IN (
      'json_manifest',
      'official_rate_manifest',
      'ota_rate_manifest',
      'google_hotels_manifest',
      'pms_manifest',
      'digital_manifest',
      'review_manifest',
      'search_manifest'
    )
  ),
  source_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cadence_minutes INTEGER NOT NULL DEFAULT 60 CHECK (cadence_minutes >= 5),
  proof_required BOOLEAN NOT NULL DEFAULT FALSE,
  freshness_minutes INTEGER NOT NULL DEFAULT 120 CHECK (freshness_minutes >= 15),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'never_checked' CHECK (
    last_status IN ('never_checked', 'ok', 'partial', 'failed', 'disabled')
  ),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verified_live_sources_enabled
  ON verified_live_data_sources(enabled, source_type, adapter_type);

CREATE INDEX IF NOT EXISTS idx_verified_live_sources_hotel
  ON verified_live_data_sources(hotel_id, enabled);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_live_sources_unique_source
  ON verified_live_data_sources(
    COALESCE(hotel_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(source_type),
    lower(source_name),
    lower(adapter_type),
    source_url
  );
