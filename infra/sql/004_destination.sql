-- Traveller destination focus (Goa | Rajasthan) for faster routing/queries

ALTER TABLE traveller_requests
  ADD COLUMN IF NOT EXISTS destination TEXT;

UPDATE traveller_requests
SET destination = CASE
  WHEN destination IS NOT NULL AND destination <> '' THEN destination
  WHEN requested_area ILIKE '%rajasthan%'
    OR requested_area ILIKE '%jaipur%'
    OR requested_area ILIKE '%jodhpur%'
    OR requested_area ILIKE '%udaipur%'
    OR requested_area ILIKE '%pushkar%'
    OR requested_area ILIKE '%jawai%'
    THEN 'Rajasthan'
  ELSE 'Goa'
END
WHERE destination IS NULL OR destination = '';

ALTER TABLE traveller_requests
  ALTER COLUMN destination SET DEFAULT 'Goa';

ALTER TABLE traveller_requests
  ALTER COLUMN destination SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'traveller_requests_destination_check'
  ) THEN
    ALTER TABLE traveller_requests
      ADD CONSTRAINT traveller_requests_destination_check
      CHECK (destination IN ('Goa', 'Rajasthan'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS traveller_requests_destination_idx
  ON traveller_requests (destination);

CREATE INDEX IF NOT EXISTS traveller_requests_destination_dates_idx
  ON traveller_requests (destination, check_in, check_out);
