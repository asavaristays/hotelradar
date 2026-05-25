CREATE TABLE IF NOT EXISTS market_opportunity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  signal_type TEXT NOT NULL,
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  signal_strength NUMERIC(10,4) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_opportunity_feed_city_created
  ON market_opportunity_feed(city, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_opportunity_feed_signal_type
  ON market_opportunity_feed(signal_type, signal_strength DESC);
