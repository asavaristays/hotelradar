-- HotelRADAR Direct spine — Opportunity ID + append-only events
-- Applied on first Postgres boot via docker-entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_opportunity_id TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  priority TEXT NOT NULL DEFAULT 'normal',
  owner_id TEXT NULL,
  referral_code TEXT NULL,
  attribution_status TEXT NOT NULL DEFAULT 'pending',
  asavari_property_id TEXT NULL,
  asavari_property_version TEXT NULL,
  asavari_booking_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT opportunities_status_check CHECK (
    status IN (
      'draft',
      'verification_pending',
      'verified',
      'qualified',
      'routed',
      'hotel_notified',
      'offer_received',
      'offer_sent',
      'traveller_accepted',
      'hotel_confirmed',
      'stay_completed',
      'commission_due',
      'settled',
      'more_details_needed',
      'hotel_declined',
      'offer_expired',
      'cancelled',
      'issue_review',
      'connector_failed'
    )
  )
);

CREATE INDEX IF NOT EXISTS opportunities_status_idx ON opportunities (status);
CREATE INDEX IF NOT EXISTS opportunities_created_at_idx ON opportunities (created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_asavari_property_id_idx ON opportunities (asavari_property_id);

CREATE TABLE IF NOT EXISTS traveller_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL UNIQUE REFERENCES opportunities (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NULL,
  otp_verified_at TIMESTAMPTZ NULL,
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_area TEXT NOT NULL,
  requested_property TEXT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  rooms INT NOT NULL DEFAULT 1,
  adults INT NOT NULL DEFAULT 2,
  children INT NOT NULL DEFAULT 0,
  budget_paise BIGINT NULL,
  public_rate_paise BIGINT NULL,
  preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  special_request TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT traveller_requests_dates_check CHECK (check_out > check_in)
);

CREATE TABLE IF NOT EXISTS opportunity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL,
  actor_id TEXT NULL,
  source_system TEXT NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT opportunity_events_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS opportunity_events_opportunity_id_idx
  ON opportunity_events (opportunity_id, occurred_at ASC);

CREATE TABLE IF NOT EXISTS connector_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NULL REFERENCES opportunities (id) ON DELETE SET NULL,
  target_system TEXT NOT NULL,
  action TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT NULL,
  safe_error_message TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT connector_jobs_status_check CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter')
  )
);

CREATE INDEX IF NOT EXISTS connector_jobs_status_next_attempt_idx
  ON connector_jobs (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS desk_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NULL REFERENCES opportunities (id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  owner_id TEXT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  CONSTRAINT desk_exceptions_status_check CHECK (
    status IN ('open', 'in_progress', 'resolved', 'wont_fix')
  )
);

CREATE INDEX IF NOT EXISTS desk_exceptions_open_idx
  ON desk_exceptions (status, created_at DESC)
  WHERE status IN ('open', 'in_progress');

INSERT INTO schema_migrations (id)
VALUES ('001_spine')
ON CONFLICT (id) DO NOTHING;
