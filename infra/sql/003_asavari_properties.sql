-- Cached Asavari property snapshots (HTTPS pull only — no shared volumes)

CREATE TABLE IF NOT EXISTS asavari_properties (
  property_id TEXT PRIMARY KEY,
  property_version TEXT NOT NULL DEFAULT 'unknown',
  name TEXT NOT NULL,
  destination TEXT NULL,
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  decision_maker TEXT NULL,
  response_hours TEXT NULL,
  payment_method TEXT NULL,
  commission_terms TEXT NULL,
  public_url TEXT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asavari_properties_destination_idx
  ON asavari_properties (destination);

CREATE INDEX IF NOT EXISTS asavari_properties_profile_complete_idx
  ON asavari_properties (profile_complete);
