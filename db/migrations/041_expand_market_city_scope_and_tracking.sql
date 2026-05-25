ALTER TABLE market_hotels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE market_hotels
SET updated_at = COALESCE(updated_at, created_at, NOW());

ALTER TABLE market_hotels
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE market_hotels
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE market_hotels
  DROP CONSTRAINT IF EXISTS market_hotels_city_check;

ALTER TABLE market_hotels
  ADD CONSTRAINT market_hotels_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram'));

CREATE INDEX IF NOT EXISTS idx_market_hotels_updated_at
  ON market_hotels(updated_at DESC);

ALTER TABLE market_opportunity_feed
  DROP CONSTRAINT IF EXISTS market_opportunity_feed_city_check;

ALTER TABLE market_opportunity_feed
  ADD CONSTRAINT market_opportunity_feed_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram'));

ALTER TABLE market_ranked_opportunities
  DROP CONSTRAINT IF EXISTS market_ranked_opportunities_city_check;

ALTER TABLE market_ranked_opportunities
  ADD CONSTRAINT market_ranked_opportunities_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram'));

ALTER TABLE market_hotel_benchmarks
  DROP CONSTRAINT IF EXISTS market_hotel_benchmarks_city_check;

ALTER TABLE market_hotel_benchmarks
  ADD CONSTRAINT market_hotel_benchmarks_city_check
  CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram'));
