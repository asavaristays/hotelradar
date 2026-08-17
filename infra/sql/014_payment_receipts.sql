-- Pilot completion: guest payment receipts (platform coordination receipt, not hotel tax invoice)

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS payment_receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_receipt_json JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_payment_receipt_number_uidx
  ON opportunities (payment_receipt_number)
  WHERE payment_receipt_number IS NOT NULL;
