-- Hotel UPI for direct-to-hotel payment instructions (no PSP).
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT;
