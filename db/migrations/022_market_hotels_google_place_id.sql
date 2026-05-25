ALTER TABLE market_hotels
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_hotels_google_place_id
  ON market_hotels(google_place_id)
  WHERE google_place_id IS NOT NULL;
