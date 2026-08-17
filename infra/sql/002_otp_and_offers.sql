-- OTP challenges + offer cache for traveller/desk Phase 1

CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  mobile TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otp_challenges_opportunity_idx
  ON otp_challenges (opportunity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS offers_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  offer_version INT NOT NULL DEFAULT 1,
  hotel_name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  occupancy TEXT NULL,
  total_amount_paise BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  tax_fee_treatment TEXT NULL,
  inclusions TEXT NULL,
  cancellation_terms TEXT NULL,
  valid_until TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  property_version TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT offers_cache_status_check CHECK (
    status IN ('ready', 'sent', 'accepted', 'expired', 'superseded')
  ),
  CONSTRAINT offers_cache_offer_unique UNIQUE (opportunity_id, offer_id, offer_version)
);

CREATE INDEX IF NOT EXISTS offers_cache_opportunity_idx
  ON offers_cache (opportunity_id, created_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('002_otp_and_offers')
ON CONFLICT (id) DO NOTHING;
