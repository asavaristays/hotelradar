-- Domain money + check-in codes + GST invoicing (from HotelRADAR backend pack).
-- Money is BIGINT paise. Breakup is snapshotted at confirmation / check-in accrual.

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS belt TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate_bps INT NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS gst_itc_opted BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pan TEXT,
  ADD COLUMN IF NOT EXISTS sac_code TEXT NOT NULL DEFAULT '998551',
  ADD COLUMN IF NOT EXISTS gateway_borne_by TEXT NOT NULL DEFAULT 'hotel',
  ADD COLUMN IF NOT EXISTS instant_quote_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS response_sla_seconds INT NOT NULL DEFAULT 600;

UPDATE hotels SET legal_name = display_name WHERE legal_name IS NULL;
UPDATE hotels SET code = upper(replace(slug, '-', '')) WHERE code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_code_unique'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_code_unique UNIQUE (code);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_gst_rate_bps_check'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_gst_rate_bps_check
      CHECK (gst_rate_bps IN (500, 1200, 1800));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_gateway_borne_by_check'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_gateway_borne_by_check
      CHECK (gateway_borne_by IN ('hotel', 'platform', 'split'));
  END IF;
END $$;

-- Money snapshot on the opportunity (Direct spine = booking carrier until Booking table lands)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS booking_status TEXT,
  ADD COLUMN IF NOT EXISTS check_in_code_id UUID,
  ADD COLUMN IF NOT EXISTS gross_collected_paise BIGINT,
  ADD COLUMN IF NOT EXISTS base_tariff_paise BIGINT,
  ADD COLUMN IF NOT EXISTS room_gst_rate_bps INT,
  ADD COLUMN IF NOT EXISTS room_gst_paise BIGINT,
  ADD COLUMN IF NOT EXISTS commission_rate_bps INT,
  ADD COLUMN IF NOT EXISTS commission_paise BIGINT,
  ADD COLUMN IF NOT EXISTS commission_gst_paise BIGINT,
  ADD COLUMN IF NOT EXISTS gateway_fee_paise BIGINT,
  ADD COLUMN IF NOT EXISTS gateway_borne_by TEXT,
  ADD COLUMN IF NOT EXISTS tcs_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payout_paise BIGINT,
  ADD COLUMN IF NOT EXISTS money_snapshotted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS booking_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL UNIQUE REFERENCES opportunities (id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  display_code TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ NULL,
  redemption_channel TEXT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_codes_expires_idx
  ON booking_codes (expires_at, redeemed_at);

ALTER TABLE commission_entries
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS taxable_value_paise BIGINT,
  ADD COLUMN IF NOT EXISTS cgst_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paise BIGINT,
  ADD COLUMN IF NOT EXISTS accrued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS base_tariff_paise BIGINT,
  ADD COLUMN IF NOT EXISTS room_gst_paise BIGINT,
  ADD COLUMN IF NOT EXISTS net_payout_paise BIGINT,
  ADD COLUMN IF NOT EXISTS breakup_json JSONB;

UPDATE commission_entries
SET taxable_value_paise = commission_paise
WHERE taxable_value_paise IS NULL;

UPDATE commission_entries
SET total_paise = commission_paise
WHERE total_paise IS NULL;

CREATE TABLE IF NOT EXISTS invoice_sequences (
  series TEXT NOT NULL,
  fy TEXT NOT NULL,
  last_number BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (series, fy)
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  series TEXT NOT NULL DEFAULT 'HR',
  fy TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'commission_invoice',
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  supplier_gstin TEXT NOT NULL,
  supplier_legal_name TEXT NOT NULL,
  supplier_address TEXT NOT NULL,
  recipient_gstin TEXT NULL,
  recipient_legal_name TEXT NOT NULL,
  recipient_address TEXT NOT NULL DEFAULT '',
  place_of_supply TEXT NOT NULL DEFAULT '30',
  taxable_value_paise BIGINT NOT NULL,
  cgst_paise BIGINT NOT NULL DEFAULT 0,
  sgst_paise BIGINT NOT NULL DEFAULT 0,
  igst_paise BIGINT NOT NULL DEFAULT 0,
  total_paise BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_type_check CHECK (type IN ('commission_invoice', 'credit_note')),
  CONSTRAINT invoices_status_check CHECK (
    status IN ('draft', 'issued', 'paid', 'partly_paid', 'disputed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS invoices_hotel_status_idx ON invoices (hotel_id, status);
CREATE INDEX IF NOT EXISTS invoices_fy_series_idx ON invoices (fy, series);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  commission_entry_id UUID NOT NULL UNIQUE REFERENCES commission_entries (id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  sac_code TEXT NOT NULL DEFAULT '998551',
  taxable_value_paise BIGINT NOT NULL,
  cgst_paise BIGINT NOT NULL DEFAULT 0,
  sgst_paise BIGINT NOT NULL DEFAULT 0,
  line_total_paise BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_id_idx ON invoice_lines (invoice_id);
