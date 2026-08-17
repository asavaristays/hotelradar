-- Domain remainder: fan-out, rate sheets, contacts, guests, payments/payouts stubs.

CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL UNIQUE,
  phone_verified_at TIMESTAMPTZ NULL,
  name TEXT NULL,
  email TEXT NULL,
  gstin TEXT NULL,
  home_city TEXT NULL,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_booking_at TIMESTAMPTZ NULL,
  lifetime_bookings INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS guests_home_city_idx ON guests (home_city);

ALTER TABLE traveller_requests
  ADD COLUMN IF NOT EXISTS guest_id UUID NULL REFERENCES guests (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS hotel_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'front_desk',
  name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  active_from_hour INT NOT NULL DEFAULT 0,
  active_to_hour INT NOT NULL DEFAULT 24,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ NULL,
  CONSTRAINT hotel_contacts_role_check CHECK (
    role IN ('owner', 'manager', 'front_desk', 'night_desk', 'accounts')
  )
);

CREATE INDEX IF NOT EXISTS hotel_contacts_hotel_role_idx ON hotel_contacts (hotel_id, role);
CREATE INDEX IF NOT EXISTS hotel_contacts_phone_idx ON hotel_contacts (phone_e164);

CREATE TABLE IF NOT EXISTS opportunity_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_viewed_at TIMESTAMPTZ NULL,
  responded_at TIMESTAMPTZ NULL,
  response_seconds INT NULL,
  outcome TEXT NULL,
  decline_reason TEXT NULL,
  escalated_at TIMESTAMPTZ NULL,
  CONSTRAINT opportunity_hotels_route_check CHECK (route IN ('instant_sheet', 'manual_quote')),
  CONSTRAINT opportunity_hotels_outcome_check CHECK (
    outcome IS NULL OR outcome IN (
      'offer_made', 'declined_no_rooms', 'declined_other', 'no_response'
    )
  ),
  CONSTRAINT opportunity_hotels_unique UNIQUE (opportunity_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS opportunity_hotels_hotel_sent_idx ON opportunity_hotels (hotel_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS opportunity_hotels_outcome_idx ON opportunity_hotels (outcome);

CREATE TABLE IF NOT EXISTS rate_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_by_contact_id UUID NULL REFERENCES hotel_contacts (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  max_discount_bps INT NOT NULL DEFAULT 3000,
  occupancy_ceiling_pct INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rate_sheets_status_check CHECK (status IN ('draft', 'active', 'superseded')),
  CONSTRAINT rate_sheets_hotel_version_unique UNIQUE (hotel_id, version)
);

CREATE INDEX IF NOT EXISTS rate_sheets_hotel_status_idx ON rate_sheets (hotel_id, status);

CREATE TABLE IF NOT EXISTS rate_sheet_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_sheet_id UUID NOT NULL REFERENCES rate_sheets (id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  season TEXT NOT NULL DEFAULT 'shoulder',
  dow_mask INT NOT NULL DEFAULT 127,
  floor_tariff_paise BIGINT NOT NULL,
  min_nights INT NOT NULL DEFAULT 1,
  max_nights INT NOT NULL DEFAULT 30,
  max_occupancy INT NOT NULL DEFAULT 2,
  advance_hours_min INT NOT NULL DEFAULT 0,
  inclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT rate_sheet_rows_season_check CHECK (
    season IN ('monsoon', 'shoulder', 'peak', 'xmas_ny')
  )
);

CREATE INDEX IF NOT EXISTS rate_sheet_rows_sheet_idx
  ON rate_sheet_rows (rate_sheet_id, season, room_type);

ALTER TABLE offers_cache
  ADD COLUMN IF NOT EXISTS opportunity_hotel_id UUID NULL REFERENCES opportunity_hotels (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'hotel_manual',
  ADD COLUMN IF NOT EXISTS rate_sheet_id UUID NULL REFERENCES rate_sheets (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_sheet_row_id UUID NULL REFERENCES rate_sheet_rows (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tariff_per_night_paise BIGINT NULL,
  ADD COLUMN IF NOT EXISTS nights INT NULL,
  ADD COLUMN IF NOT EXISTS holds_until TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offers_cache_source_check'
  ) THEN
    ALTER TABLE offers_cache ADD CONSTRAINT offers_cache_source_check
      CHECK (source IN ('rate_sheet', 'hotel_manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hotel_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual_neft',
  linked_account_id TEXT NULL,
  account_holder TEXT NOT NULL,
  ifsc_last4 TEXT NULL,
  account_last4 TEXT NULL,
  kyc_status TEXT NOT NULL DEFAULT 'pending',
  activated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hotel_payout_accounts_provider_check CHECK (
    provider IN ('razorpay_route', 'cashfree_split', 'manual_neft')
  ),
  CONSTRAINT hotel_payout_accounts_kyc_check CHECK (
    kyc_status IN ('pending', 'submitted', 'active', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS hotel_payout_accounts_hotel_kyc_idx
  ON hotel_payout_accounts (hotel_id, kyc_status);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_order_id TEXT NULL,
  provider_payment_id TEXT UNIQUE,
  amount_paise BIGINT NOT NULL,
  method TEXT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  captured_at TIMESTAMPTZ NULL,
  webhook_payload JSONB NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_provider_check CHECK (provider IN ('razorpay', 'cashfree', 'manual')),
  CONSTRAINT payments_status_check CHECK (
    status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'partly_refunded')
  )
);

CREATE INDEX IF NOT EXISTS payments_opportunity_status_idx ON payments (opportunity_id, status);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  hotel_payout_account_id UUID NULL REFERENCES hotel_payout_accounts (id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  amount_paise BIGINT NOT NULL,
  provider_transfer_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  held_until TIMESTAMPTZ NULL,
  settled_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  transfer_fee_paise BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payouts_trigger_check CHECK (
    trigger IN ('code_redeemed', 'ops_override', 'auto_release')
  ),
  CONSTRAINT payouts_status_check CHECK (
    status IN ('pending', 'queued', 'processing', 'settled', 'failed', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS payouts_status_held_idx ON payouts (status, held_until);

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS booking_entered_payment_pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_entered_payment_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS domain_opp_status TEXT;

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS stop_sell BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS opportunities_booking_status_idx
  ON opportunities (booking_status)
  WHERE booking_status IS NOT NULL;
