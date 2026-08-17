-- files-6 additions: settlement attestation, media, belt notes, WA templates, travel cache

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS settlement_mode TEXT NOT NULL DEFAULT 'direct_to_hotel',
  ADD COLUMN IF NOT EXISTS payment_utr TEXT,
  ADD COLUMN IF NOT EXISTS guest_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hotel_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attestation_entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_done JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_settlement_mode_check'
  ) THEN
    ALTER TABLE opportunities ADD CONSTRAINT opportunities_settlement_mode_check
      CHECK (settlement_mode IN ('direct_to_hotel', 'escrow'));
  END IF;
END $$;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS utr TEXT,
  ADD COLUMN IF NOT EXISTS guest_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hotel_attested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS payments_utr_idx ON payments (utr) WHERE utr IS NOT NULL;

ALTER TABLE rate_sheet_rows
  ADD COLUMN IF NOT EXISTS blackout_dates DATE[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS hotel_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  room_type TEXT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  thumb_url TEXT NULL,
  caption TEXT NULL,
  width INT NULL,
  height INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ NULL,
  CONSTRAINT hotel_media_kind_check CHECK (
    kind IN ('room', 'bathroom', 'pool', 'exterior', 'breakfast', 'beach_path', 'view')
  )
);

CREATE INDEX IF NOT EXISTS hotel_media_hotel_kind_idx ON hotel_media (hotel_id, kind, sort_order);

CREATE TABLE IF NOT EXISTS travel_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_key TEXT NOT NULL,
  hotel_id UUID NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  seconds INT NOT NULL,
  meters INT NOT NULL,
  taxi_estimate_paise BIGINT NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT travel_cache_origin_hotel_unique UNIQUE (origin_key, hotel_id)
);

CREATE INDEX IF NOT EXISTS travel_cache_expires_idx ON travel_cache (expires_at);

CREATE TABLE IF NOT EXISTS belt_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belt TEXT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT NOT NULL,
  months_applicable INT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT belt_notes_kind_check CHECK (
    kind IN ('noise', 'access', 'monsoon', 'crowd', 'food', 'safety', 'seasonal')
  )
);

CREATE INDEX IF NOT EXISTS belt_notes_belt_kind_idx ON belt_notes (belt, kind, active);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft',
  body_text TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'UTILITY',
  approved_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_templates_status_check CHECK (
    status IN ('draft', 'submitted', 'approved', 'rejected', 'paused')
  )
);

-- Seed Meta template specs from comms.ts (status draft until approved)
INSERT INTO whatsapp_templates (key, name, language, status, body_text, variables, category)
VALUES
  ('offer_ready', 'offer_ready', 'en', 'draft',
   'Hi {{1}}, {{2}} has sent your private rate: {{3}} total. Held until {{4}}. View and confirm: {{5}}',
   ARRAY['guest_name','hotel_name','amount','holds_until','link'], 'UTILITY'),
  ('payment_instructions', 'payment_instructions', 'en', 'draft',
   'To confirm {{1}}: pay {{2}} to {{3}}. Then send us the UTR number here. Ref {{4}}.',
   ARRAY['hotel_name','amount','upi_id','booking_ref'], 'UTILITY'),
  ('booking_confirmed_with_code', 'booking_confirmed_with_code', 'en', 'draft',
   'Confirmed at {{1}} for {{2}}. Show this code at check-in: {{3}}. Ref {{4}}.',
   ARRAY['hotel_name','check_in','code','booking_ref'], 'UTILITY'),
  ('hotel_offer_request', 'hotel_offer_request', 'en', 'draft',
   'New request: {{1}}, {{2}}, {{3}}. Verified guest. Send your rate or decline: {{4}}',
   ARRAY['dates','guests','room_type','respond_link'], 'UTILITY'),
  ('hotel_payment_check', 'hotel_payment_check', 'en', 'draft',
   'Has {{1}} paid {{2}} for booking {{3}}? Reply YES or NO.',
   ARRAY['guest_name','amount','booking_ref'], 'UTILITY'),
  ('day1_checkin', 'day1_checkin', 'en', 'draft',
   'Hi {{1}}, settled in at {{2}}? If you''d like somewhere different for tomorrow, just reply and we''ll find it.',
   ARRAY['guest_name','hotel_name'], 'UTILITY'),
  ('post_stay_review', 'post_stay_review', 'en', 'draft',
   'Hi {{1}}, how was {{2}}? One line is enough — it decides whether we keep sending guests there.',
   ARRAY['guest_name','hotel_name'], 'UTILITY')
ON CONFLICT (key) DO NOTHING;

INSERT INTO belt_notes (belt, kind, note, months_applicable)
SELECT * FROM (VALUES
  ('morjim', 'noise', 'Morjim is quieter than Anjuna at night; beach shacks taper early mid-week.', ARRAY[]::int[]),
  ('anjuna', 'noise', 'Anjuna is loud on Wednesdays and weekends — say so before sending a light sleeper.', ARRAY[]::int[]),
  ('arambol', 'access', 'Arambol last stretch can be rough in monsoon; prefer day arrivals.', ARRAY[6,7,8,9]),
  ('candolim', 'crowd', 'Candolim packs hard Dec–Jan; price and wait times climb with footfall.', ARRAY[12,1])
) AS v(belt, kind, note, months_applicable)
WHERE NOT EXISTS (SELECT 1 FROM belt_notes LIMIT 1);
