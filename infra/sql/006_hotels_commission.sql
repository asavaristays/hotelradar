-- Super Admin ops: hotels, OPP hotel link, privacy + deadlines, commission ledger

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  display_name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  notify_whatsapp TEXT NULL,
  notify_email TEXT NULL,
  commission_pct_bps INT NOT NULL DEFAULT 1000,
  settlement_cycle TEXT NOT NULL DEFAULT 'monthly',
  asavari_property_id TEXT NULL,
  notes TEXT NULL,
  live_at TIMESTAMPTZ NULL,
  paused_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hotels_destination_check CHECK (destination IN ('Goa', 'Rajasthan')),
  CONSTRAINT hotels_status_check CHECK (
    status IN ('lead', 'draft', 'review', 'contracted', 'live', 'paused', 'offboarded')
  ),
  CONSTRAINT hotels_commission_bps_check CHECK (commission_pct_bps >= 0 AND commission_pct_bps <= 5000)
);

CREATE INDEX IF NOT EXISTS hotels_destination_status_idx ON hotels (destination, status);

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS hotel_id UUID NULL REFERENCES hotels (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hotel_booking_ref TEXT NULL,
  ADD COLUMN IF NOT EXISTS mobile_shared_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS offer_request_deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accept_deadline_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS opportunities_hotel_id_idx ON opportunities (hotel_id);

CREATE TABLE IF NOT EXISTS commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  hotel_id UUID NULL REFERENCES hotels (id) ON DELETE SET NULL,
  stay_total_paise BIGINT NOT NULL DEFAULT 0,
  commission_paise BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'due',
  period_key TEXT NULL,
  invoice_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ NULL,
  CONSTRAINT commission_entries_status_check CHECK (
    status IN ('accrued', 'due', 'invoiced', 'settled', 'void')
  ),
  CONSTRAINT commission_entries_opportunity_unique UNIQUE (opportunity_id)
);

CREATE INDEX IF NOT EXISTS commission_entries_status_idx ON commission_entries (status, created_at DESC);
